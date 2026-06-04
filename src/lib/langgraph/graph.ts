import { END, START, StateGraph } from "@langchain/langgraph"

import { plannerAgent } from "./nodes/plannerAgent"
import { profileAgent } from "./nodes/profileAgent"
import { visionAgent } from "./nodes/visionAgent"
import {
  PlanningGraphAnnotation,
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
} from "./state"
import type { ModelOverrides } from "./providers"

function passValidatedVision(): PlanningGraphAnnotationUpdate {
  return {}
}

function routeAfterVision(state: PlanningGraphAnnotationState) {
  if (process.env.STOP_AT_AGENT === "vision") {
    return "stop"
  }
  return state.isValidTimetable ? "valid" : "invalid"
}

export function createPlanningGraph(modelOverrides?: ModelOverrides) {
  return new StateGraph(PlanningGraphAnnotation)
    .addNode("vision", (state) => visionAgent(state, modelOverrides?.vision))
    .addNode("profile", (state) => profileAgent(state, modelOverrides?.profile))
    .addNode("visionValidated", passValidatedVision)
    .addNode("planner", (state) => plannerAgent(state, modelOverrides?.planner))
    .addEdge(START, "vision")
    .addEdge(START, "profile")
    .addConditionalEdges("vision", routeAfterVision, {
      valid: "visionValidated",
      invalid: END,
      stop: END,
    })
    .addEdge(["visionValidated", "profile"], "planner")
    .addEdge("planner", END)
    .compile()
}
