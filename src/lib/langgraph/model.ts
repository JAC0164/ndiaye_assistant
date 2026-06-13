import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import type { LLMResult } from "@langchain/core/outputs"
import { createModel } from "./providers/factory"
import { getModelConfigForAgent } from "./providers"
import { logger } from "@/src/lib/logger"
import type { AgentName, ModelProviderConfig } from "./providers"

export function getModel(agentName?: AgentName, overrides?: Partial<ModelProviderConfig>): BaseChatModel {
  const config = getModelConfigForAgent(agentName ?? "planner", overrides)
  return createModel(config)
}

interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

interface CustomLLMOutput {
  tokenUsage?: TokenUsage
  estimatedTokenUsage?: TokenUsage
}

interface CustomMessage {
  usage_metadata?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export function createTokenLogger(agentName: string) {
  const startTime = Date.now()
  return {
    callbacks: [
      {
        handleLLMEnd(output: LLMResult) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1)
          const llmOutput = output.llmOutput as CustomLLMOutput | undefined
          const tokenUsage = llmOutput?.tokenUsage || llmOutput?.estimatedTokenUsage

          const generation = output.generations?.[0]?.[0]
          // @ts-expect-error message may not exist on base Generation type but exists on ChatGeneration
          const message = generation?.message as CustomMessage | undefined
          const usageMetadata = message?.usage_metadata

          const promptTokens = tokenUsage?.promptTokens || usageMetadata?.input_tokens || 0
          const completionTokens = tokenUsage?.completionTokens || usageMetadata?.output_tokens || 0
          const totalTokens = tokenUsage?.totalTokens || usageMetadata?.total_tokens || promptTokens + completionTokens

          logger.info({ promptTokens, completionTokens, totalTokens, duration, agent: agentName }, "Token usage")
        },
      },
    ],
  }
}
