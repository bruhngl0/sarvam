import express, { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";
import { writeFileSync } from "fs";
import { generateTTS } from "./service";

const app = express();
const port = 3000;

app.get("/", (res: any) => {
  res.json("server running");
});

// Endpoint to handle audio file upload and transcription
app.post("/upload", async (req: any, res: any) => {
  const audioFilePath = path.join(
    __dirname,
    "../../Desktop/call-agent-inputs/hindi-input.wav",
  ); // Replace with your audio file path

  if (!fs.existsSync(audioFilePath)) {
    return res.status(400).send("Audio file not found.");
  }

  try {
    // Read the audio file from disk
    const audioFile = fs.createReadStream(audioFilePath);

    // Prepare form data
    const formData = new FormData();
    formData.append("file", audioFile, "audio.mp3"); // Adjust file name and type if needed
    formData.append("model", "saarika:v2");
    formData.append("language_code", "unknown");
    formData.append("with_timestamps", "false");
    formData.append("with_diarization", "false");
    formData.append("num_speakers", "1");

    // Set up headers
    const headers = {
      ...formData.getHeaders(),
      "api-subscription-key": "MY SARVAM API", // Replace with your Sarvam API key
    };

    // Make the API request
    const apiResponse = await axios.post(
      "https://api.sarvam.ai/speech-to-text",
      formData,
      { headers: headers },
    );

    // Log the response
    console.log("API Response:", apiResponse.data);

    //----- send the transcript to groq and get the response

    const transcript = apiResponse.data.transcript;
    if (!transcript) {
      return res.status(500).send("No transcript found in Sarvam response.");
    }

    const language_code = apiResponse.data.language_code;
    console.log(language_code);

    const groqPayload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: transcript,
        },
      ],
    };

    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      groqPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer my groq api`, // Store your API key in .env
        },
      },
    );

    const reply = groqRes.data.choices[0].message.content;
    console.log("Transcript:", transcript);
    console.log("Groq Reply:", reply);

    const limitedReply = reply.slice(0, 100).trim();
    console.log("Limited Groq Reply:", limitedReply);

    const audioUrl = await generateTTS({
      text: limitedReply,
      languageCode: language_code,
    });

    if (!audioUrl) {
      console.log("TTS audio URL not generated");
    } else {
      console.log("TTS Audio URL:", audioUrl);
    }

    const base64Audio = audioUrl;
    if (!base64Audio) {
      return res.status(500).send("No base64 audio found in TTS response.");
    }

    // Convert base64 to binary and save as .mp3 (or .wav depending on sample rate)
    const outputFile = path.join(__dirname, "output_audio10.mp3");
    const audioBuffer = Buffer.from(base64Audio, "base64");

    writeFileSync(outputFile, audioBuffer);
    console.log("Audio file saved to:", outputFile);

    // Send the response back to the client

    /* const ttsPayload = {
      inputs: [reply],
      target_language_code: language_code, // or "en-IN", "bn-IN" etc
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
          "api-subscription-key": "dc39ab8c-dcb4-4f7d-b082-b93b63cc40ec",
        },
      },
    );

    const audioUrl = ttsRes.data.audios?.[0];
    if (!audioUrl) {
      console.log("data not present");
    }
    console.log("TTS Audio URL:", audioUrl); */
  } catch (error) {
    console.error("Error transcribing audio:", error);
    res.status(500).send("Server error.");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
