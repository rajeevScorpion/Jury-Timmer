const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const OPENAI_MODEL = "gpt-4o-mini";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyApiError(status: number, body: string): string {
  if (status === 429) return "AI service is busy. Please try again in a moment.";
  if (status === 401 || status === 403) return "AI API key is invalid or expired.";
  if (status >= 500) return "AI service is temporarily unavailable. Please retry.";
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || `AI error (${status})`;
  } catch {
    return `AI error (${status})`;
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    // Retry on 429 (rate limit) and 5xx (server errors)
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const err = await response.text();
    throw new Error(friendlyApiError(response.status, err));
  }
  throw new Error("AI service is unavailable. Please try again.");
}

async function callOpenAI(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY is not set in environment variables.");
  }

  const response = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    }
  );

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Improve a single feedback field: fix spelling, grammar, articulate better.
 * Returns the improved text (max 100 words).
 */
export async function improveFeedback(text: string): Promise<string> {
  return callOpenAI(
    `You are a writing assistant for academic jury feedback.

Rules:
- Fix spelling, grammar, and punctuation errors.
- Improve articulation and clarity while preserving the original meaning.
- Use a constructive, positive, and professional tone.
- Be direct and to the point. NEVER start with filler phrases like "I would like to provide feedback", "The student has", "Overall, the student" or similar preambles. Jump straight into the substantive observation.
- Strip any conversational or customary pleasantries that add no meaning (e.g. "my feedback is", "I would like to say", "thank you for presenting").
- STRICT LIMIT: maximum 100 words. Be concise.
- Output ONLY the improved text, nothing else.
- Always respond in English.`,
    text
  );
}

/**
 * Generate overall feedback from per-subject notes and optional existing draft.
 * Returns a cohesive summary (100-150 words).
 */
export async function generateOverallFeedback(
  perSubject: Record<string, string>,
  overallDraft: string
): Promise<string> {
  const subjectLines = Object.entries(perSubject)
    .filter(([, note]) => note.trim().length > 0)
    .map(([subject, note]) => `[${subject}]: ${note}`)
    .join("\n");

  const userContent = [
    subjectLines ? `Per-subject feedback:\n${subjectLines}` : "",
    overallDraft?.trim()
      ? `\nExisting overall notes:\n${overallDraft}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return callOpenAI(
    `You are a writing assistant for academic jury feedback.

Rules:
- Synthesize the provided per-subject feedback notes into a cohesive overall summary.
- Fix any spelling or grammar issues.
- Use a constructive, positive, and professional tone.
- Be direct and to the point. NEVER start with filler phrases like "I would like to provide feedback", "The student has demonstrated", "Overall, the student" or similar preambles. Jump straight into the substantive observations.
- Strip any conversational or customary pleasantries that add no meaning.
- Highlight both strengths and areas for improvement in a balanced, encouraging way.
- STRICT LIMIT: maximum 150 words. Be concise.
- Output ONLY the summary text, nothing else.
- Always respond in English.`,
    userContent
  );
}

/**
 * Transcribe audio using OpenAI Whisper API.
 */
async function transcribeAudio(blob: Blob): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY is not set in environment variables.");
  }

  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  const response = await fetchWithRetry(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    }
  );

  const data = await response.json();
  return (data.text ?? "").trim();
}

/**
 * Transcribe audio blob via Whisper, then refine the transcript with GPT.
 * Returns polished text ready to append to a feedback field.
 */
export async function transcribeAndRefine(blob: Blob): Promise<string> {
  const raw = await transcribeAudio(blob);
  if (!raw) throw new Error("No speech detected in recording.");

  return callOpenAI(
    `You are a writing assistant for academic jury feedback. The following text was transcribed from a voice recording.

Rules:
- Fix any transcription errors, spelling, grammar, and punctuation issues.
- Improve clarity while preserving the original meaning.
- Use a constructive, positive, and professional tone.
- IMPORTANT: Strip all conversational filler and customary speech patterns from the voice input. Remove phrases like "my feedback is", "I would like to say", "so basically", "thank you for presenting", "um", "you know", etc. Extract ONLY the meaningful, substantive feedback content.
- Be direct and to the point. Do not start with preambles.
- STRICT LIMIT: maximum 100 words. Be concise.
- Output ONLY the refined text, nothing else.
- Always respond in English.`,
    raw
  );
}
