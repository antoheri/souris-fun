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

// Fonction pour générer une cible aléatoire
function spawnTarget() {
  // Ne pas générer plus de 150 cibles
  if (Object.keys(targets).length >= 150) {
    return;
  }

  const targetId = `target-${targetCounter++}`;

  targets[targetId] = {
    id: targetId,
    x: Math.random() * 1200 + 50,
    y: Math.random() * 800 + 50,
  };

  io.emit("spawn_target", targets[targetId]);
}

// Génération de cibles avec intervalle dynamique
function generateTargets() {
  spawnTarget();

  // Si moins de 20 cibles, générer toutes les 0.5 secondes, sinon 1 seconde
  const interval = Object.keys(targets).length < 20 ? 500 : 1000;

  setTimeout(generateTargets, interval);
}

// Démarrer la génération de cibles
generateTargets();

// Fonction pour envoyer le leaderboard à tous les clients
function broadcastLeaderboard() {
  const leaderboard = Object.values(users)
    .sort((a, b) => b.score - a.score)
    .map((user) => ({
      id: user.id,
      username: user.username,
      score: user.score,
    }));
  io.emit("leaderboard_update", leaderboard);
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

    // Envoyer les infos de cet utilisateur à tous les autres
    socket.broadcast.emit("new_user", users[socket.id]);

    // Envoyer tous les utilisateurs existants au nouveau client
    socket.emit(
      "existing_users",
      Object.values(users).filter((u) => u.id !== socket.id),
    );

    // Envoyer toutes les cibles actuelles au nouveau client
    Object.values(targets).forEach((target) => {
      socket.emit("spawn_target", target);
    });

    // Envoyer le leaderboard initial
    broadcastLeaderboard();
  });

  socket.on("mouse_move", (data) => {
    io.emit("user_update", {
      id: socket.id,
      x: data.x,
      y: data.y,
      message: data.message || "",
      username: data.username || "",
      image: users[socket.id]?.image || "",
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

      // Mettre à jour le classement
      broadcastLeaderboard();
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user_disconnected", socket.id);
    broadcastLeaderboard();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
