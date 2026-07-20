const express = require("express");
const cors = require("cors");
const { randomUUID } = require("node:crypto");

const app = express();
const port = process.env.PORT || 8080;
const jobs = new Map();

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "oci-queue-demo-api",
    mode: "local"
  });
});

app.post("/jobs", (request, response) => {
  const { reportName = "Relatório de demonstração", requestedBy = "usuário" } = request.body;
  const jobId = randomUUID();

  const job = {
    jobId,
    reportName,
    requestedBy,
    status: "PROCESSING",
    createdAt: new Date().toISOString(),
    completedAt: null,
    result: null
  };

  jobs.set(jobId, job);

  // Será substituído pelo producer + OCI Queue no próximo incremento.
  setTimeout(() => {
    jobs.set(jobId, {
      ...job,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      result: `Relatório "${reportName}" processado com sucesso.`
    });
  }, 3000);

  response.status(202).json(job);
});

app.get("/jobs/:jobId", (request, response) => {
  const job = jobs.get(request.params.jobId);

  if (!job) {
    return response.status(404).json({ message: "Job não encontrado." });
  }

  response.json(job);
});

app.listen(port, () => {
  console.log(`API disponível em http://localhost:${port}`);
});