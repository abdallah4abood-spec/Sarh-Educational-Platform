import { z } from "zod";

/**
 * Parent assistant request contract.
 *
 * The assistant is a generic educational helper. Its upstream body deliberately
 * contains only the question, language and the bounded conversation history:
 * no child id, name, institution, grade, score or announcement. Keeping this
 * builder in one place lets the route and its tests prove that a parent with
 * no institutional grant cannot leak scoped identity to the AI service.
 */
export const parentChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { message: "اكتب سؤالك أولاً" })
    .max(600),
  language: z.enum(["ar", "en"]).default("ar"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(1000),
      })
    )
    .max(8)
    .default([]),
});

export type ParentChatInput = z.infer<typeof parentChatSchema>;

export interface ParentChatUpstreamBody {
  message: string;
  language: "ar" | "en";
  history: { role: "user" | "assistant"; text: string }[];
}

/** The exact body forwarded to the FastAPI service — identity-free by design. */
export function parentChatUpstreamBody(
  input: ParentChatInput
): ParentChatUpstreamBody {
  return {
    message: input.message,
    language: input.language,
    history: input.history,
  };
}
