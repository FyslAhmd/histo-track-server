const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.port || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mo9z4qj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const artifactsCollections = client
      .db("HistoTrack")
      .collection("AllArtifacts");

    const dailyArtifactCollection = client
      .db("HistoTrack")
      .collection("dailyArtifact");

    app.get("/allArtifacts", async (req, res) => {
      const result = await artifactsCollections.find().toArray();
      res.send(result);
    });

    app.get("/featuredArtifacts", async (req, res) => {
      const result = await artifactsCollections
        .find()
        .sort({ totalLiked: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/dailyArtifact", async (req, res) => {
      const today = new Date().toISOString().split("T")[0];
      const existing = await dailyArtifactCollection.findOne({ date: today });
      if (existing) {
        const artifact = await artifactsCollections.findOne({
          _id: new ObjectId(existing.artifactId),
        });
        return res.send(artifact);
      }

      const [randomArtifact] = await artifactsCollections
        .aggregate([{ $sample: { size: 1 } }])
        .toArray();
      await dailyArtifactCollection.insertOne({
        artifactId: randomArtifact._id,
        date: today,
      });
      res.send(randomArtifact);
    });

    app.post("/allArtifacts", async (req, res) => {
      const data = req.body;
      const result = await artifactsCollections.insertOne(data);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Histo Track Server Started");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Histo Track");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
