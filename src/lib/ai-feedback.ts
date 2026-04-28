const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const OPENAI_MODEL = "gpt-4o-mini";

async function callOpenAI(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY is not set in environment variables.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Improve a single feedback field: fix spelling, grammar, articulate better.
 * Returns the improved text (50-100 words).
 */
export async function improveFeedback(text: string): Promise<string> {
  return callOpenAI(
    "You are a helpful writing assistant for academic faculty feedback. Fix spelling, grammar, and punctuation errors. Improve articulation and clarity while preserving the original meaning and intent. Keep the tone professional and constructive. Output ONLY the improved text, nothing else. Keep it concise: 50 to 100 words. Always respond in English.",
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
    "You are a helpful writing assistant for academic faculty feedback. Synthesize the provided per-subject feedback notes into a cohesive overall summary. Fix any spelling or grammar issues. Use a professional, constructive academic tone. Output ONLY the summary text, nothing else. Keep it between 100 to 150 words. Always respond in English.",
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

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper error (${response.status}): ${err}`);
  }

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
    "You are a helpful writing assistant for academic faculty feedback. The following text was transcribed from a voice recording. Fix any transcription errors, spelling, grammar, and punctuation issues. Improve clarity while preserving the original meaning. Keep the tone professional and constructive. Output ONLY the refined text, nothing else. Always respond in English.",
    raw
  );
}
