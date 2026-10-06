const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:4000/";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function requestGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok)
    throw new Error(`GraphQL request failed (${response.status}).`);
  const result = (await response.json()) as GraphQLResponse<T>;
  if (result.errors?.length) {
    throw new Error(result.errors.map((item) => item.message).join("; "));
  }
  if (!result.data)
    throw new Error("The GraphQL response did not contain data.");
  return result.data;
}

// Journal-linked photometry for the stock row's light curve
export const PHOTOMETRY_LINK_FIELDS = `
  link {
    __typename
    ... on T0Document {
      tag
      body
    }
    ... on T1Document {
      dps {
        tag
        body
      }
    }
  }
`;
