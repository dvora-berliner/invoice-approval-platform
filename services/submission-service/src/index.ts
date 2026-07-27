import { app } from "./app";
import { startOutboxRelay } from "./outboxRelay";

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(port, () => {
  console.log(`submission-service listening on port ${port}`);
});

startOutboxRelay();
