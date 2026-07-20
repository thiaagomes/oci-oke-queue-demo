const express = require("express");
const cors = require("cors");
const { randomUUID } = require("node:crypto");
const { getOciClients } = require("./oci-clients");

const app = express();
const port = process.env.PORT || 8080;
const appMode = process.env.APP_MODE || "local";
const localJobs = new Map();

app.use(cors());
app.use(express.json());

function jobObjectName(jobId) {
  return `jobs/${jobId}.json`;
}

async function streamToString(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function saveOciJob(job) {
  const {
    objectStorageClient,
    objectStorageNamespace,
    bucketName,
  } = getOciClients();

  const body = JSON.stringify(job);

  await objectStorageClient.putObject({
    namespaceName: objectStorageNamespace,
    bucketName,
    objectName: jobObjectName(job.jobId),
    contentType: "application/json",
    contentLength: Buffer.byteLength(body),
    putObjectBody: body,
  });
}

async function getOciJob(jobId) {
  const {
    objectStorageClient,
    objectStorageNamespace,
    bucketName,
  } = getOciClients();

  try {
    const response = await objectStorageClient.getObject({
      namespaceName: objectStorageNamespace,
      bucketName,
      objectName: jobObjectName(jobId),
    });

    return JSON.parse(await streamToString(response.value));
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }

    throw error;
  }
}

async function enqueueOciJob(job) {
  const { queueClient, queueId } = getOciClients();

  await queueClient.putMessages({
    queueId,
    putMessagesDetails: {
      messages: [
        {
          content: JSON.stringify({
            jobId: job.jobId,
            reportName: job.reportName,
            requestedBy: job.requestedBy,
          }),
        },
      ],
    },
  });
}

function simulateLocalProcessing(job) {
  setTimeout(() => {
    const currentJob = localJobs.get(job.jobId);

    if (!currentJob) {
      return;
    }

    localJobs.set(job.jobId, {
      ...currentJob,
      status: "PROCESSING",
      startedAt: new Date().toISOString(),
    });
  }, 500);

  setTimeout(() => {
    const currentJob = localJobs.get(job.jobId);

    if (!currentJob) {
      return;
    }

    localJobs.set(job.jobId, {
      ...currentJob,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      result: `Relatório "${currentJob.reportName}" processado com sucesso.`,
    });
  }, 3000);
}

app.get("/health", (request, response) => {
  response.json({
    status: "ok",
    service: "oci-queue-demo-api",
    mode: appMode,
  });
});

app.post("/jobs", async (request, response, next) => {
  try {
    const { reportName, requestedBy } = request.body ?? {};

    if (!reportName || !requestedBy) {
      return response.status(400).json({
        message: "Os campos reportName e requestedBy são obrigatórios.",
      });
    }

    const job = {
      jobId: randomUUID(),
      reportName,
      requestedBy,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
    };

    if (appMode === "oci") {
      await saveOciJob(job);
      await enqueueOciJob(job);
    } else {
      localJobs.set(job.jobId, job);
      simulateLocalProcessing(job);
    }

    return response.status(202).json(job);
  } catch (error) {
    return next(error);
  }
});

app.get("/jobs/:jobId", async (request, response, next) => {
  try {
    const { jobId } = request.params;

    const job =
      appMode === "oci" ? await getOciJob(jobId) : localJobs.get(jobId);

    if (!job) {
      return response.status(404).json({
        message: "Job não encontrado.",
      });
    }

    return response.json(job);
  } catch (error) {
    return next(error);
  }
});

app.use((error, request, response, next) => {
  console.error(error);

  response.status(500).json({
    message: "Erro ao processar a solicitação.",
  });
});

app.listen(port, () => {
  console.log(`API disponível em http://localhost:${port} no modo ${appMode}`);
});