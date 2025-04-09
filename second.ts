import express, { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";
import { writeFileSync } from "fs";
import { twiml as TwilioTwiml } from "twilio";
import bodyParser from "body-parser";
import { generateTTS } from "./service";

const app = express();
const port = 3000;

// Use body-parser to parse form data from Twilio
app.use(bodyParser.urlencoded({ extended: false }));
app.use("/audio", express.static(path.join(__dirname, "public/audio")));

// Basic route to check if server is running
app.get("/", (req: any, res: any) => {
  res.json("server running");
});

// Entry point for call
app.post("/voice", (req: any, res: any) => {
  const response = new TwilioTwiml.VoiceResponse();
  response.say("Hey there. Please speak after the beep.");
  response.record({
    action: "/recording",
    method: "POST",
    maxLength: 30,
    playBeep: true,
    trim: "trim-silence",
  });
  res.type("text/xml").send(response.toString());
});

// Handle recording
app.post("/recording", async (req: any, res: any) => {
  const recordingUrl = req.body.RecordingUrl;

  try {
    const cleanUrl = recordingUrl.replace(
      /^https?:\/\/[^/]+/,
      "https://api.twilio.com",
    );
    console.log(cleanUrl);
    // 1️⃣ Get audio from Twilio
    // 1️⃣ Get audio from Twilio (.mp3 preferred, fallback to .wav after delay)
    const fetchAudio = async (format: "mp3" | "wav") => {
      const url = `${cleanUrl}.${format}`;
      try {
        const res = await axios.get(url, {
          responseType: "arraybuffer",
          auth: {
            username:
              process.env.TWILIO_ACCOUNT_SID! ||
              "AC854572ba696a00fb3ad38b1cd3bc8ee5",
            password:
              process.env.TWILIO_AUTH_TOKEN! ||
              "586e98ad603ae1ab44fe12648584451c",
          },
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 404 && format === "mp3") {
          console.log("MP3 not found, retrying WAV after 2s...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return fetchAudio("wav");
        }
        throw err;
      }
    };

    const audioBuffer = Buffer.from(await fetchAudio("mp3"));

    // 2️⃣ Send audio buffer to Sarvam STT
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: "audio.wav",
      contentType: "audio/wav",
    });
    formData.append("model", "saarika:v2");
    formData.append("language_code", "unknown");
    formData.append("with_timestamps", "false");
    formData.append("with_diarization", "false");
    formData.append("num_speakers", "1");

    const sttResponse = await axios.post(
      "https://api.sarvam.ai/speech-to-text",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "api-subscription-key":
            process.env.SARVAM_API_KEY ||
            "dc39ab8c-dcb4-4f7d-b082-b93b63cc40ec",
        },
      },
    );

    const transcript = sttResponse.data.transcript;
    const languageCode = sttResponse.data.language_code || "en-IN";
    console.log("🧠 Transcript:", transcript);

    // 3️⃣ Send transcript to Groq
    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: transcript }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY || "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"}`,
        },
      },
    );

    const reply = groqRes.data.choices[0].message.content.trim();
    const limitedReply = reply.slice(0, 100);
    console.log("🤖 Groq Reply:", limitedReply);

    const base64Audio = await generateTTS({
      text: limitedReply,
      languageCode,
    });

    if (!base64Audio) {
      throw new Error("TTS audio generation failed");
    }

    const uniqueFilename = `output_audio_${Date.now()}.mp3`;
    const outputFile = path.join(__dirname, "public/audio", uniqueFilename);
    const audioBufferReply = Buffer.from(base64Audio, "base64");
    writeFileSync(outputFile, audioBufferReply);
    console.log("Audio file saved to:", outputFile);

    const ngrokUrl =
      process.env.NGROK_URL || "aef8-49-207-245-144.ngrok-free.app"; //change this accordingly--change this in webhook in twilio dashboard
    const response = new TwilioTwiml.VoiceResponse();
    if (!response) {
      console.log("no response from twilio");
    }
    response.play(`https://${ngrokUrl}/audio/${uniqueFilename}`);

    res.type("text/xml").send(response.toString());
  } catch (error) {
    console.error(" Error handling call:", error);
    const fail = new TwilioTwiml.VoiceResponse();
    fail.say("Something went wrong. Please try again.");
    res.type("text/xml").send(fail.toString());
  }
});

// For testing purpose

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
