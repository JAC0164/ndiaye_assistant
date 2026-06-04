import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { createModel } from "./providers/factory"
import { getModelConfigForAgent } from "./providers"
import type { AgentName, ModelProviderConfig } from "./providers"

export function getModel(
  agentName?: AgentName,
  overrides?: Partial<ModelProviderConfig>
): BaseChatModel {
  const config = getModelConfigForAgent(agentName ?? "planner", overrides)
  return createModel(config)
}
