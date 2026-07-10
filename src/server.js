const createApp = require('./app');
const pendingOrdersJob = require('./jobs/processPendingOrdersJob');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Order processing API listening on port ${PORT}`);
  pendingOrdersJob.start();
});
