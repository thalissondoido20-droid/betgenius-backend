// FUTURO: aqui vai a integração real com API-SPORTS.
// Por enquanto deixamos pronto mas sem usar.

const axios = require("axios");

const API_BASE = "https://v3.football.api-sports.io";

function getHeaders() {
  return {
    "x-apisports-key": process.env.API_SPORTS_KEY
  };
}

// Exemplo (não estamos chamando ainda)
async function getStatus() {
  const res = await axios.get(`${API_BASE}/status`, { headers: getHeaders() });
  return res.data;
}

module.exports = {
  getStatus
};
