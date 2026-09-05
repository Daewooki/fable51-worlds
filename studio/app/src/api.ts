// Thin fetch wrappers for the Task 6 server routes.
const j = (r: Response) => r.json();
export const api = {
  projects: (): Promise<any> => fetch('/api/projects').then(j),
  create: (name: string, world: string): Promise<any> =>
    fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, world }) }).then(j),
  get: (id: string): Promise<any> => fetch(`/api/projects/${id}`).then(j),
  save: (p: any): Promise<any> =>
    fetch(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }).then(j),
  job: (projectId: string, input: any): Promise<any> =>
    fetch(`/api/projects/${projectId}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j),
  jobStatus: (id: string): Promise<any> => fetch(`/api/jobs/${id}`).then(j),
  async pollJob(id: string, onUpdate: (job: any) => void): Promise<any> {
    for (;;) {
      const job = await this.jobStatus(id);
      onUpdate(job);
      if (job.status === 'done' || job.status === 'failed') return job;
      await new Promise((r) => setTimeout(r, 1500));
    }
  },
};
