import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

/**
 * Define the subject schemas for the access tokens
 * These define what will be included in the JWT payload
 */
export const subjects = createSubjects({
  /**
   * Standard user subject - contains basic user information
   */
  user: object({
    userId: string(),
    workspaceId: string(),
  }),
}); 