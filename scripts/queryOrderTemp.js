const mongoose = require("mongoose");

const DB_URL = "mongodb+srv://yagnik:p%40nsuriy%40111@cluster0.k9frh.mongodb.net/kidroo?appName=Cluster0";

async function run() {
  await mongoose.connect(DB_URL);
  const db = mongoose.connection.db;
  const order = await db.collection("orders").findOne({ _id: new mongoose.Types.ObjectId("6a8495915d4fb662d93c479c") });
  console.log("ORDER:", JSON.stringify(order, null, 2));
  await mongoose.disconnect();
}

run().catch(console.error);
