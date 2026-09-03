import { Long } from "mongodb";
import { GraphQLScalarType } from "graphql";
import { JSONResolver as BaseJSONResolver } from "graphql-scalars";

export const BSONLongResolver = new GraphQLScalarType({
  name: "Long",
  description: "Long integer type, represented as a string in GraphQL",
  serialize(value: unknown) {
    if (value instanceof Long) {
      return value.toExtendedJSON();
    }
    throw new TypeError(`Cannot serialize ${typeof value} as Long`);
  },
  parseValue(value: unknown) {
    if (typeof value === "string") {
      return Long.fromString(value);
    } else if (typeof value === "number") {
      return Long.fromNumber(value);
    }
    throw new TypeError(`Cannot parse ${typeof value} as Long`);
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case "IntValue":
      case "StringValue":
        return new Long(ast.value);
      default:
        throw new TypeError(`Cannot parse literal of kind ${ast.kind} as Long`);
    }
  },
});

/* eslint-disable  @typescript-eslint/no-explicit-any */
const serializeJSONObject = (value: any) => {
  if (value instanceof Long) {
    return BSONLongResolver.serialize(value);
  }
  if (typeof value == "object" && value !== null && value !== undefined) {
    Object.keys(value).forEach((key) => {
      value[key] = serializeJSONObject(value[key]);
    });
    return value;
  }
  return value;
};

// Custom JSONObject resolver that serializes Long values in extended JSON format
export const JSONObjectResolver = new GraphQLScalarType({
  ...BaseJSONResolver,
  serialize(value: any) {
    return serializeJSONObject(value);
  },
});
