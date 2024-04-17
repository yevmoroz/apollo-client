import "../utilities/globals/index.js";

import type { GraphQLErrorExtensions } from "graphql";
import { GraphQLError } from "graphql";

import { isNonNullObject } from "../utilities/index.js";
import type { ServerParseError } from "../link/http/index.js";
import type { ServerError } from "../link/utils/index.js";
import type { FetchResult } from "../link/core/index.js";

// This Symbol allows us to pass transport-specific errors from the link chain
// into QueryManager/client internals without risking a naming collision within
// extensions (which implementers can use as they see fit).
export const PROTOCOL_ERRORS_SYMBOL: unique symbol = Symbol();

type FetchResultWithSymbolExtensions<T> = FetchResult<T> & {
  extensions: Record<string | symbol, any>;
};

export interface ApolloErrorOptions {
  graphQLErrors?: GraphQLErrorsFromResponse;
  protocolErrors?: ReadonlyArray<{
    message: string;
    extensions?: GraphQLErrorExtensions[];
  }>;
  clientErrors?: ReadonlyArray<Error>;
  networkError?: Error | ServerParseError | ServerError | null;
  errorMessage?: string;
  extraInfo?: any;
}

export function graphQLResultHasProtocolErrors<T>(
  result: FetchResult<T>
): result is FetchResultWithSymbolExtensions<T> {
  if (result.extensions) {
    return Array.isArray(
      (result as FetchResultWithSymbolExtensions<T>).extensions[
        PROTOCOL_ERRORS_SYMBOL
      ]
    );
  }
  return false;
}

export function isApolloError(err: Error): err is ApolloError {
  return err.hasOwnProperty("graphQLErrors");
}

// Sets the error message on this error according to the
// the GraphQL and network errors that are present.
// If the error message has already been set through the
// constructor or otherwise, this function is a nop.
const generateErrorMessage = (err: ApolloError) => {
  const errors = [
    ...err.graphQLErrors,
    ...err.clientErrors,
    ...err.protocolErrors,
  ];
  if (err.networkError) errors.push(err.networkError);
  return (
    errors
      // The rest of the code sometimes unsafely types non-Error objects as GraphQLErrors
      .map(
        (err) =>
          (isNonNullObject(err) && err.message) || "Error message not found."
      )
      .join("\n")
  );
};

/**
 * A GraphQLError, as received from the server in a GraphQL Response
 *
 * See https://github.com/graphql/graphql-spec/blob/main/spec/Section%207%20--%20Response.md#errors
 * (scroll down to Error Result Format)
 * Only `message` is mandatory in the spec, the other fields are optional.
 */
export type GraphQLErrorFromResponse = Pick<GraphQLError, "message"> &
  Partial<GraphQLError>;
export type GraphQLErrorsFromResponse = ReadonlyArray<GraphQLErrorFromResponse>;

export type GraphQLErrors = ReadonlyArray<GraphQLError>;

export type NetworkError = Error | ServerParseError | ServerError | null;

export class ApolloError extends Error {
  public name: string;
  public message: string;
  public graphQLErrors: GraphQLErrorsFromResponse;
  public protocolErrors: ReadonlyArray<{
    message: string;
    extensions?: GraphQLErrorExtensions[];
  }>;
  public clientErrors: ReadonlyArray<Error>;
  public networkError: Error | ServerParseError | ServerError | null;

  // An object that can be used to provide some additional information
  // about an error, e.g. specifying the type of error this is. Used
  // internally within Apollo Client.
  public extraInfo: any;

  // Constructs an instance of ApolloError given a GraphQLError
  // or a network error. Note that one of these has to be a valid
  // value or the constructed error will be meaningless.
  constructor({
    graphQLErrors,
    protocolErrors,
    clientErrors,
    networkError,
    errorMessage,
    extraInfo,
  }: ApolloErrorOptions) {
    super(errorMessage);
    this.name = "ApolloError";
    this.graphQLErrors = (graphQLErrors || []).map(reviveGraphQLError);
    this.protocolErrors = protocolErrors || [];
    this.clientErrors = clientErrors || [];
    this.networkError = networkError || null;
    this.message = errorMessage || generateErrorMessage(this);
    this.extraInfo = extraInfo;

    // We're not using `Object.setPrototypeOf` here as it isn't fully
    // supported on Android (see issue #3236).
    (this as any).__proto__ = ApolloError.prototype;
  }
}

/**
 * Revives a GraphQL error that has been received over the network.
 * Some fields of GraphQL errors, e.g. `extensions`, are not mandatory in the
 * spec, but they are not optional in the `GraphQLError` type.
 * This function ensures that all errors are instances of the `GraphQLError` class.
 */
export function reviveGraphQLError(
  error: GraphQLErrorFromResponse
): GraphQLError {
  return error instanceof GraphQLError ? error : (
      new GraphQLError(
        error.message,
        // This will pass `message` into the `options` parameter.
        // The constructor does not expect that, but it will ignore it and we
        // don't need to destructure `error`, saving some bundle size.
        error
      )
    );
}
