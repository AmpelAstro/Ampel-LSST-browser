import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";

const port: number = process.env.GRAPHQL_PORT
  ? parseInt(process.env.GRAPHQL_PORT)
  : 4000;
const host: string | undefined = process.env.GRAPHQL_HOST || undefined;
const path: string | undefined = process.env.GRAPHQL_PATH || undefined;

async function main() {
  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    listen: { port, host, path },
  });
  console.log(`Server running at ${url}`);
}

main();
