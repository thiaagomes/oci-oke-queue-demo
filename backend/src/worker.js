const { getOciClients } = require("./oci-clients");

let running = true;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

async function getOciJob(jobId) {
  const {
    objectStorageClient,
    objectStorageNamespace,
    bucketName,
  } = getOciClients();

  const response = await objectStorageClient.getObject({
    namespaceName: objectStorageNamespace,
    bucketName,
    objectName: jobObjectName(jobId),
  });

  return JSON.parse(await streamToString(response.value));
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

async function processMessage(message) {
  const payload = JSON.parse(message.content);
  const job = await getOciJob(payload.jobId);

  const processingJob = {
    ...job,
    status: "PROCESSING",
    startedAt: new Date().toISOString(),
  };

  await saveOciJob(processingJob);
  console.log(`Processando job ${processingJob.jobId}`);

  await sleep(3000);

  const completedJob = {
    ...processingJob,
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
    result: `Relatório "${processingJob.reportName}" processado com sucesso.`,
  };

  await saveOciJob(completedJob);

  const { queueClient, queueId } = getOciClients();

  await queueClient.deleteMessage({
    queueId,
    messageReceipt: message.receipt,
  });

  console.log(`Job ${completedJob.jobId} concluído e mensagem removida da Queue`);
}

async function runWorker() {
  if (process.env.APP_MODE !== "oci") {
    throw new Error("O worker deve ser executado com APP_MODE=oci.");
  }

  const { queueClient, queueId } = getOciClients();

  console.log("Worker conectado. Aguardando mensagens da OCI Queue...");

  while (running) {
    try {
      const response = await queueClient.getMessages({
        queueId,
        limit: 1,
        timeoutInSeconds: 20,
        visibilityInSeconds: 30,
      });

      const messages = response.getMessages.messages || [];

      for (const message of messages) {
        await processMessage(message);
      }
    } catch (error) {
      console.error("Falha no processamento; a mensagem poderá ser reenviada:", error);
      await sleep(5000);
    }
  }
}

process.on("SIGTERM", () => {
  running = false;
});

runWorker().catch((error) => {
  console.error("Worker encerrado com erro:", error);
  process.exit(1);
});