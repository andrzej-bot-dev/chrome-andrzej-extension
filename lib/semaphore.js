// Simple async semaphore for limiting concurrency of parallel workers.
//
// Usage:
//   const sem = new Semaphore(4);
//   await sem.run(async () => { /* at most 4 run at once */ });

export class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max);
    this.count = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.count--;
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
