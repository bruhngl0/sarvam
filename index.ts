import express, { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
const port = 3000;

// Endpoint to handle audio file upload and transcription
app.post("/upload", async (req: any, res: any) => {
  const audioFilePath = path.join(__dirname, "../../Downloads/sample2.wav"); // Replace with your audio file path

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
      "api-subscription-key": "insert-api-key", // Replace with your Sarvam API key
    };

    // Make the API request
    const apiResponse = await axios.post(
      "https://api.sarvam.ai/speech-to-text",
      formData,
      { headers: headers },
    );

    // Log the response
    console.log("API Response:", apiResponse.data);

    // Send the response back to the client
    res.json(apiResponse.data);
  } catch (error) {
    console.error("Error transcribing audio:", error);
    res.status(500).send("Server error.");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
