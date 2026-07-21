const nodeFetch = require("node-fetch");

global.fetch = nodeFetch;
global.Headers = nodeFetch.Headers;
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;

const common = require("oci-common");
const queue = require("oci-queue");
const objectstorage = require("oci-objectstorage");

let clients;

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }

  return value;
}

function getOciClients() {
  if (clients) {
    return clients;
  }

  const provider =
    common.OkeWorkloadIdentityAuthenticationDetailsProvider.builder();

  const queueClient = new queue.QueueClient({
    authenticationDetailsProvider: provider,
  });
  queueClient.endpoint = required("OCI_QUEUE_MESSAGES_ENDPOINT");

  const objectStorageClient = new objectstorage.ObjectStorageClient({
    authenticationDetailsProvider: provider,
  });
  objectStorageClient.regionId = required("OCI_REGION");

  clients = {
    queueClient,
    objectStorageClient,
    queueId: required("OCI_QUEUE_ID"),
    objectStorageNamespace: required("OCI_OBJECT_STORAGE_NAMESPACE"),
    bucketName: required("OCI_OBJECT_STORAGE_BUCKET"),
  };

  return clients;
}

module.exports = { getOciClients };