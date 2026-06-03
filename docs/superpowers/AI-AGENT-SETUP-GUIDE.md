# AI Agent Setup Guide (Vercel AI SDK + Next.js)

This guide covers the **core wiring** to get an AI agent running in any Next.js App Router project.
It is based on 4 files — the agent route, system prompt builder, and two example tools.
Replace the domain-specific parts (DB queries, tool logic) with your own project's context.

---

## File Structure

```
src/
├── app/
│   └── (private)/
│       └── api/
│           └── agent/
│               └── route.ts        ← Agent API endpoint
└── lib/
    ├── prompts.ts                  ← Builds the system prompt
    ├── memory.ts                   ← (optional) injects past overrides into prompt
    └── tools/
        ├── myTool.ts               ← One file per tool
        └── anotherTool.ts
```

---

## 1. Install Dependencies

```bash
npm install ai @ai-sdk/openai zod
```

---

## 2. Environment Variable

```bash
# .env.local
OPENAI_API_KEY=sk-proj-...
```

---

## 3. Agent API Route

**`src/app/(private)/api/agent/route.ts`**

This is the single endpoint the frontend calls. It:
- Reads `message`, `taskType`, and `history` from the request body
- Builds the system prompt (can be dynamic — pulling from DB, config, etc.)
- Calls `generateText()` with your tools registered
- Returns `{ answer: string }`

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { myTool } from '@/lib/tools/myTool';
import { anotherTool } from '@/lib/tools/anotherTool';
import { buildSystemPrompt } from '@/lib/prompts';

export async function POST(req: Request) {
  const { message, taskType = 'default', history = [] } = await req.json();

  const systemPrompt = await buildSystemPrompt(taskType);

  const result = await generateText({
    model: openai('gpt-4.1'),
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
    tools: { myTool, anotherTool },
    stopWhen: stepCountIs(5),   // max 5 tool-call rounds per request
  });

  return Response.json({ answer: result.text });
}
```

**Key points:**
- `history` is the full conversation array `[{ role, content }, ...]` — the frontend manages it, not the server.
- `taskType` lets one endpoint serve multiple use cases with different prompts.
- `stopWhen: stepCountIs(5)` prevents infinite tool-call loops.
- Add every tool you create to the `tools: {}` object.

---

## 4. System Prompt Builder

**`src/lib/prompts.ts`**

Builds the system prompt per request. Can be a static string or pull dynamic data (DB rules, user config, past feedback). Replace the content with your project's context.

```typescript
// Replace getProtocolRules and getMemoryRules with your own data sources,
// or remove them and use a static string.
import { getProtocolRules } from '@/db/queries';   // your DB query
import { getMemoryRules } from './memory';          // optional feedback loop

export async function buildSystemPrompt(taskType: string): Promise<string> {
  const rules = await getProtocolRules();

  const rulesText =
    rules.length === 0
      ? 'No rules defined yet.'
      : rules
          .map((r) => `- ${r.ruleName}: ${r.customRule || r.defaultRule}`)
          .join('\n');

  const memoryText = await getMemoryRules(taskType); // past user overrides

  return `You are an AI assistant for [Your Company].
You help [describe the role].

RULES — always apply these:
${rulesText}

PAST CORRECTIONS — apply the same logic to similar cases:
${memoryText}

Always:
- Give a clear recommendation (e.g. Approve / Reject / Review)
- Explain your reasoning in 2–3 sentences
- Be concise and professional`;
}
```

**If you don't need dynamic rules**, simplify to:

```typescript
export async function buildSystemPrompt(_taskType: string): Promise<string> {
  return `You are an AI assistant for [Your Company].
[Describe what the agent does, what decisions it makes, what format to respond in.]`;
}
```

---

## 5. Tool Structure

Each tool is a function the agent can call. The agent decides **which tool to call and when** based on the user's message and the tool's `description`.

**`src/lib/tools/myTool.ts`**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

// Define the input schema with zod — the agent fills these from the user's message
const myToolSchema = z.object({
  entity_name: z.string().describe('Name of the entity to look up'),
  check_type: z
    .enum(['type_a', 'type_b', 'full'])
    .default('full')
    .describe('What kind of check to run'),
});

export const myTool = tool({
  description:
    'Describe what this tool does and when the agent should call it. Be specific — the agent uses this to decide.',
  inputSchema: myToolSchema,
  execute: async ({ entity_name, check_type }: z.infer<typeof myToolSchema>) => {
    // Put your logic here:
    // - Query your database
    // - Call an external API
    // - Perform a calculation
    // - Write a record

    // Return a plain object — the agent reads this and formulates its response
    return {
      entity: entity_name,
      result: 'your data here',
      flag: 'Green', // or whatever your domain needs
    };
  },
});
```

**Tool that calls an external API with a fallback:**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const researchSchema = z.object({
  name: z.string().describe('Name of the company or organization to research'),
  checkType: z
    .enum(['legitimacy', 'financial', 'reputation', 'full'])
    .default('full')
    .describe('Type of due diligence check to perform'),
});

export const researchTool = tool({
  description:
    'Research a company or organization using public web sources or training knowledge',
  inputSchema: researchSchema,
  execute: async ({ name, checkType }: z.infer<typeof researchSchema>) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (apiKey && apiKey.trim().length > 0) {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: `${name} ${checkType} reputation legal background`,
            max_results: 5,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const results: Array<{ content: string; url: string }> = data.results ?? [];
          const summary = results.map((r) => r.content).join(' ').slice(0, 1500);

          const hasRedFlags = /lawsuit|fraud|scandal|bankrupt|investigation/i.test(summary);
          const hasWarnings = /concern|risk|decline|loss|controversy/i.test(summary);
          const flag = hasRedFlags ? 'Red' : hasWarnings ? 'Yellow' : 'Green';

          return {
            name,
            flag,
            summary: summary || 'No significant public information found.',
            sources: results.map((r) => r.url),
            source_type: 'web_search',
          };
        }
      } catch {
        // fall through to training knowledge fallback
      }
    }

    // Fallback: tell the LLM to use its training data
    return {
      name,
      flag: null,
      summary: null,
      sources: [],
      source_type: 'training_knowledge',
      instruction: `Web search is not available. Use your training knowledge to research "${name}" for a ${checkType} check. Assess: reputation, legal issues, financial health, and overall risk. Return Green / Yellow / Red with reasoning. If you have limited information, flag it Yellow and recommend manual research.`,
    };
  },
});
```

**Key points about the fallback pattern:**
- Return a `source_type: 'training_knowledge'` field with an `instruction` string.
- In the system prompt, add: *"When a tool returns `source_type: training_knowledge`, follow the `instruction` field and make a real assessment using your training data."*
- This means the agent still produces a useful answer even without an external API key.

---

## 6. Frontend — Calling the Agent

```typescript
const [history, setHistory] = useState<{ role: string; content: string }[]>([]);

async function askAgent(userMessage: string) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      taskType: 'default',   // match your taskType values
      history,               // full conversation history
    }),
  });

  const { answer } = await res.json();

  setHistory((prev) => [
    ...prev,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: answer },
  ]);
}
```

---

## 7. Checklist

- [ ] `npm install ai @ai-sdk/openai zod`
- [ ] Add `OPENAI_API_KEY` to `.env.local`
- [ ] Create `src/lib/tools/myTool.ts` — one file per tool
- [ ] Create `src/lib/prompts.ts` — describe what the agent does
- [ ] Create `src/app/(private)/api/agent/route.ts` — register all tools
- [ ] Call `POST /api/agent` from the frontend with `{ message, taskType, history }`

---

## Summary of the Pattern

| File | What to change for your project |
|------|----------------------------------|
| `route.ts` | Import your tools, keep the rest as-is |
| `prompts.ts` | Write your system prompt — role, rules, output format |
| `tools/*.ts` | Replace execute logic with your DB queries / API calls |
| Frontend | Send `{ message, taskType, history }`, read `answer` |
