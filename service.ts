// services/tts.ts
import axios from "axios";

export interface TTSParams {
  text: string;
  languageCode: string;
}

export const generateTTS = async ({
  text,
  languageCode,
}: TTSParams): Promise<string | null> => {
  try {
    const ttsPayload = {
      inputs: [text],
      target_language_code: languageCode || "en-IN",
      speaker: "meera",
      pitch: 0,
      pace: 1.2,
      loudness: 1.2,
      speech_sample_rate: 8000,
      enable_preprocessing: false,
      model: "bulbul:v1",
    };

    const ttsRes = await axios.post(
      "https://api.sarvam.ai/text-to-speech",
      ttsPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": "my-sarvam-api", // move to .env in production
        },
      },
    );

    const audioUrl = ttsRes.data.audios?.[0] || null;

    return audioUrl;
  } catch (err) {
    console.error("TTS generation failed:", err);
    return null;
  }
};
