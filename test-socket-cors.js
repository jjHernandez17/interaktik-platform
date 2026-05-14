// Test script
const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", {
  extraHeaders: {
    origin: "https://interaktik-platform.vercel.app"
  }
});

socket.on("connect", () => {
  console.log("Socket connected successfully");
  socket.disconnect();
});

socket.on("connect_error", (err) => {
  console.log(`Socket connect_error: ${err.message}`);
});