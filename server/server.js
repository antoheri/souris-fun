const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "..", "client")));

// Stocker les infos des utilisateurs
const users = {};
const targets = {};
let targetCounter = 0;
let lastLeaderboardBroadcast = 0;
const LEADERBOARD_THROTTLE = 1000; // Envoyer le leaderboard max 1x par seconde

// Fonction pour générer une cible aléatoire
function spawnTarget() {
  const targetId = `target-${targetCounter++}`;

  targets[targetId] = {
    id: targetId,
    x: Math.random() * 1200 + 50,
    y: Math.random() * 800 + 50,
  };

  io.emit("spawn_target", targets[targetId]);
}

// Générer une nouvelle cible toutes les 1 secondes
setInterval(() => {
  spawnTarget();
}, 1000);

// Fonction pour envoyer le leaderboard à tous les clients (avec throttling)
function broadcastLeaderboard() {
  const now = Date.now();
  if (now - lastLeaderboardBroadcast >= LEADERBOARD_THROTTLE) {
    const leaderboard = Object.values(users)
      .sort((a, b) => b.score - a.score)
      .map((u) => ({ id: u.id, username: u.username, score: u.score }));
    io.emit("leaderboard_update", leaderboard);
    lastLeaderboardBroadcast = now;
  }
}

io.on("connection", (socket) => {
  console.log(`Utilisateur connecté : ${socket.id}`);

  // Réception de la connexion utilisateur avec username et image
  socket.on("user_login", (data) => {
    users[socket.id] = {
      id: socket.id,
      username: data.username || "Anonyme",
      image: data.image || "",
      score: 0,
    };

    // Envoyer les infos de cet utilisateur à TOUS les clients (y compris lui-même)
    io.emit("new_user", users[socket.id]);

    // Envoyer tous les utilisateurs existants au nouveau client
    socket.emit(
      "existing_users",
      Object.values(users).filter((u) => u.id !== socket.id),
    );

    // Envoyer toutes les cibles actuelles au nouveau client
    Object.values(targets).forEach((target) => {
      socket.emit("spawn_target", target);
    });

    // Envoyer le leaderboard au nouveau client
    broadcastLeaderboard();
  });

  socket.on("mouse_move", (data) => {
    // Envoyer seulement la position (username et message viennent du client)
    io.emit("user_update", {
      id: socket.id,
      x: data.x,
      y: data.y,
      message: data.message || "",
    });
  });

  // Gérer le hit d'une cible
  socket.on("hit_target", (data) => {
    const targetId = data.targetId;
    if (targets[targetId]) {
      delete targets[targetId];

      // Ajouter 10 points à l'utilisateur
      if (users[socket.id]) {
        users[socket.id].score += 10;
      }

      // Notifier tous les clients
      io.emit("target_hit", { id: targetId });
      io.emit("score_update", {
        userId: socket.id,
        points: 10,
      });

      // Envoyer le leaderboard mis à jour
      broadcastLeaderboard();
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user_disconnected", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
