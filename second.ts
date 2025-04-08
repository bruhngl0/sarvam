

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

// Basic route to check if server is running
app.get("/", (req: any, res: any) => {
  res.json("server running");
});

// Endpoint to serve audio files
app.get("/audio/:filename", (req: any, res: any) => {
  const audioPath = path.join(__dirname, req.params.filename);
  if (!fs.existsSync(audioPath)) {
    return res.status(404).send("Audio file not found");
  }
  res.type("audio/mpeg").sendFile(audioPath);
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
      /^https?:\\/\\/[^/]+/,
      "https://api.twilio.com",
    );
    console.log(cleanUrl);
    // 1️⃣ Get audio from Twilio
    const audioRes = await axios.get(`${cleanUrl}.wav`, {
      responseType: "arraybuffer",
      auth: {
        username:
          process.env.TWILIO_ACCOUNT_SID! ||
          "twilio-sid",
        password:
          process.env.TWILIO_AUTH_TOKEN! || "twilio-token",
      },
    });
    const audioBuffer = Buffer.from(audioRes.data);

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
            "my-sarvam-apikey",
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
          Authorization: `Bearer ${process.env.GROQ_API_KEY || "my-groq-apikey"}`,
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
    const outputFile = path.join(__dirname, uniqueFilename);
    const audioBufferReply = Buffer.from(base64Audio, "base64");
    writeFileSync(outputFile, audioBufferReply);
    console.log("Audio file saved to:", outputFile);

    const ngrokUrl =
      process.env.NGROK_URL || "8458-49-207-242-13.ngrok-free.app"; //change this accordingly--change this in webhook in twilio dashboard
    const response = new TwilioTwiml.VoiceResponse();
    response.play(`https://${ngrokUrl}/audio/${uniqueFilename}`);

    res.type("text/xml").send(response.toString());
  } catch (error) {
    console.error("❌ Error handling call:", error);
    const fail = new TwilioTwiml.VoiceResponse();
    fail.say("Something went wrong. Please try again.");
    res.type("text/xml").send(fail.toString());
  }
});

// For testing purpose
app.post("/upload", async (req: any, res: any) => {
  const audioFilePath = path.join(__dirname, "../../Downloads/telgu1.wav");

  if (!fs.existsSync(audioFilePath)) {
    return res.status(400).send("Audio file not found.");
  }

  try {
    const audioFile = fs.createReadStream(audioFilePath);
    const formData = new FormData();
    formData.append("file", audioFile, "audio.mp3");
    formData.append("model", "saarika:v2");
    formData.append("language_code", "unknown");
    formData.append("with_timestamps", "false");
    formData.append("with_diarization", "false");
    formData.append("num_speakers", "1");

    const headers = {
      ...formData.getHeaders(),
      "api-subscription-key": process.env.SARVAM_API_KEY || "my sarvam apikey",
    };

    const apiResponse = await axios.post(
      "https://api.sarvam.ai/speech-to-text",
      formData,
      { headers: headers },
    );

    console.log("API Response:", apiResponse.data);

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
          Authorization: `Bearer ${process.env.GROQ_API_KEY || "gro-api-key"}`,
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
      return res.status(500).send("TTS generation failed.");
    }

    console.log("TTS Audio data received");

    const outputFile = path.join(__dirname, "output_audio_test.mp3");
    const audioBuffer = Buffer.from(audioUrl, "base64");

    writeFileSync(outputFile, audioBuffer);
    console.log("Audio file saved to:", outputFile);

    res.json({
      transcript: transcript,
      reply: limitedReply,
      audioSaved: true,
      audioPath: outputFile,
    });
  } catch (error) {
    console.error("Error transcribing audio:", error);
    res.status(500).send("Server error.");
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});


