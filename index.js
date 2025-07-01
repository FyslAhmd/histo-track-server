const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.port || 5000;
const admin = require("firebase-admin");
require("dotenv").config();

app.use(cors());
app.use(express.json());

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mo9z4qj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const varifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

async function run() {
  try {
    // await client.connect();
    const artifactsCollections = client
      .db("HistoTrack")
      .collection("AllArtifacts");

    const dailyArtifactCollection = client
      .db("HistoTrack")
      .collection("dailyArtifact");

    app.get("/allArtifacts", async (req, res) => {
      const sort = req.query.sort; // e.g., 'likes-desc' or 'name-asc'

      let sortOption = {};

      switch (sort) {
        case "name-asc":
          sortOption = { ArtifactName: 1 };
          break;
        case "name-desc":
          sortOption = { ArtifactName: -1 };
          break;
        case "likes-asc":
          sortOption = { totalLiked: 1 };
          break;
        case "likes-desc":
          sortOption = { totalLiked: -1 };
          break;
      }

      const artifacts = await artifactsCollections
        .find()
        .sort(sortOption)
        .toArray();
      res.send(artifacts);
    });

    app.get("/featuredArtifacts", async (req, res) => {
      const result = await artifactsCollections
        .find()
        .sort({ totalLiked: -1 })
        .limit(8)
        .toArray();
      res.send(result);
    });

    app.get("/dailyArtifact", async (req, res) => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const existing = await dailyArtifactCollection.findOne({ date: today });

        if (existing) {
          const artifact = await artifactsCollections.findOne({
            _id: new ObjectId(existing.artifactId),
          });

          if (!artifact) {
            return res.status(404).send({ error: "Artifact not found." });
          }

          return res.send(artifact);
        }

        const [randomArtifact] = await artifactsCollections
          .aggregate([{ $sample: { size: 1 } }])
          .toArray();

        if (!randomArtifact) {
          return res.status(404).send({ error: "No artifacts in database." });
        }

        await dailyArtifactCollection.insertOne({
          artifactId: randomArtifact._id,
          date: today,
        });

        res.send(randomArtifact);
      } catch (error) {
        console.error("Error in /dailyArtifact:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.get("/artifact/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await artifactsCollections.findOne(query);
      res.send(result);
    });

    app.get("/liked-artifacts", varifyFirebaseToken, async (req, res) => {
      const userEmail = req.query.email;

      if (userEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { likedBy: { $in: [userEmail] } };
      const result = await artifactsCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/myArtifacts", varifyFirebaseToken, async (req, res) => {
      const userEmail = req.query.email;

      if (userEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { email: userEmail };
      const result = await artifactsCollections.find(query).toArray();
      res.send(result);
    });

    app.post("/allArtifacts", async (req, res) => {
      const data = req.body;
      const result = await artifactsCollections.insertOne(data);
      res.send(result);
    });

    app.patch("/artifact/:id", async (req, res) => {
      const id = req.params.id;
      const { userEmail } = req.body;
      const query = { _id: new ObjectId(id) };
      const artifact = await artifactsCollections.findOne(query);
      const likedUsers = artifact.likedBy || [];
      let updateDoc = {};
      if (likedUsers.includes(userEmail)) {
        updateDoc = {
          $inc: { totalLiked: -1 },
          $pull: { likedBy: userEmail },
        };
      } else {
        updateDoc = {
          $inc: { totalLiked: 1 },
          $addToSet: { likedBy: userEmail },
        };
      }
      const result = await artifactsCollections.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/updateArtifact/:id", varifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const artifact = await artifactsCollections.findOne(query);
      if (!artifact) {
        return res.status(404).send("Artifact not found");
      }
      if (artifact.email !== req.decoded.email) {
        return res
          .status(403)
          .send("Forbidden: You are not allowed to update this artifact");
      }
      const updatedDoc = {
        $set: req.body,
      };
      const result = await artifactsCollections.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.delete("/allArtifacts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await artifactsCollections.deleteOne(query);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("Histo Track Server Started");
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
