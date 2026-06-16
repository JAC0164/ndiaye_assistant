import { END, START, StateGraph } from "@langchain/langgraph"

import { plannerAgent } from "./nodes/plannerAgent"
import { prePlannerNode } from "./nodes/prePlannerNode"
import { profileAgent } from "./nodes/profileAgent"
import { visionAgent } from "./nodes/visionAgent"
import { PlanningGraphAnnotation, PlanningGraphAnnotationState } from "./state"

function routeAfterVision(state: PlanningGraphAnnotationState) {
  return state.isValidTimetable ? "valid" : "invalid"
}

export function createPlanningGraph() {
  return new StateGraph(PlanningGraphAnnotation)
    .addNode("vision", (state) => visionAgent(state))
    .addNode("profile", (state) => profileAgent(state))
    .addNode("prePlanner", prePlannerNode)
    .addNode("planner", (state) => plannerAgent(state))
    .addEdge(START, "vision")
    .addEdge(START, "profile")
    .addConditionalEdges("vision", routeAfterVision, {
      valid: "prePlanner",
      invalid: END,
    })
    .addEdge("profile", "prePlanner")
    .addEdge("prePlanner", "planner")
    .addEdge("planner", END)
    .compile()
}
