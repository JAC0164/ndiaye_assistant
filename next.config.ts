import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@langchain/core",
    "@langchain/google-genai",
    "@langchain/openai",
    "@langchain/anthropic",
    "@langchain/ollama",
    "langchain",
    "@langchain/langgraph",
  ],
};

export default nextConfig;
