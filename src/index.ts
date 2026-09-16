import { createApp } from './server';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Ticket pricing engine listening on http://localhost:${PORT}`);
  console.log(`Counter UI:   http://localhost:${PORT}/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
