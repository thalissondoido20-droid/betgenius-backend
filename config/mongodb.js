import { MongoClient } from "mongodb";

// Credenciais - pode ser sobrescrito por variáveis de ambiente
const MONGODB_USER = process.env.MONGODB_USER || "thalissondoido20_db_user";
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || "ZAm7NtahzIRy9f2B";
const MONGODB_CLUSTER = process.env.MONGODB_CLUSTER || "cluster0.t9utjd3.mongodb.net";
const DB_NAME = process.env.MONGODB_DB_NAME || "betgenius";

// Construir URI seguindo o formato padrão do MongoDB Atlas
// IMPORTANTE: A senha pode conter caracteres especiais que precisam ser codificados
// Se a senha contém: @, :, /, ?, #, [, ], !, $, &, ', (, ), *, +, ,, ;, =, espaços
// eles devem ser codificados com encodeURIComponent
const encodedPassword = encodeURIComponent(MONGODB_PASSWORD);
const MONGODB_URI = `mongodb+srv://${MONGODB_USER}:${encodedPassword}@${MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=Cluster0`;

let client = null;
let db = null;

export async function connectMongoDB() {
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      await client.connect();
      // Testar conexão
      await client.db("admin").command({ ping: 1 });
      db = client.db(DB_NAME);
      console.log("✅ MongoDB conectado com sucesso");
      console.log(`📊 Database: ${DB_NAME}`);
    }
    return db;
  } catch (err) {
    console.error("❌ Erro ao conectar MongoDB:", err.message);
    if (err.message.includes("authentication") || err.message.includes("bad auth")) {
      console.error("\n🔐 ERRO DE AUTENTICAÇÃO - Verifique:");
      console.error(`   1. Usuário: ${MONGODB_USER}`);
      console.error(`   2. Senha está correta? (primeiros 3 chars: ${MONGODB_PASSWORD.substring(0, 3)}***)`);
      console.error("   3. O usuário existe no MongoDB Atlas?");
      console.error("   4. O IP está na whitelist do MongoDB Atlas?");
      console.error("   5. O usuário tem permissões no database?");
      console.error("\n💡 Dica: Você pode usar variáveis de ambiente:");
      console.error("   MONGODB_USER=seu_usuario MONGODB_PASSWORD=sua_senha node index.js");
    }
    throw err;
  }
}

export async function getDB() {
  if (!db) {
    await connectMongoDB();
  }
  return db;
}

export async function closeMongoDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("✅ MongoDB desconectado");
  }
}
