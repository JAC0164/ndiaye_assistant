import { END, START, StateGraph } from "@langchain/langgraph"

import { plannerAgent } from "./nodes/plannerAgent"
import { profileAgent } from "./nodes/profileAgent"
import { visionAgent } from "./nodes/visionAgent"
import {
  PlanningGraphAnnotation,
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
} from "./state"

function passValidatedVision(): PlanningGraphAnnotationUpdate {
  return {}
}

function routeAfterVision(state: PlanningGraphAnnotationState) {
  return state.isValidTimetable ? "valid" : "invalid"
}

export function createPlanningGraph() {
  return new StateGraph(PlanningGraphAnnotation)
    .addNode("vision", visionAgent)
    .addNode("profile", profileAgent)
    .addNode("visionValidated", passValidatedVision)
    .addNode("planner", plannerAgent)
    .addEdge(START, "vision")
    .addEdge(START, "profile")
    .addConditionalEdges("vision", routeAfterVision, {
      valid: "visionValidated",
      invalid: END,
    })
    .addEdge(["visionValidated", "profile"], "planner")
    .addEdge("planner", END)
    .compile()
}
