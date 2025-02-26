import { serve } from 'bun';
import { fetch } from 'undici';
import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';

// Initialize database
const DB_PATH = './jobs.db';
const isNewDb = !existsSync(DB_PATH);
const db = new Database(DB_PATH);

// Set up database schema if it's a new database
if (isNewDb) {
  console.log('Creating new database...');
  db.run(`
    CREATE TABLE labs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      last_updated TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE jobs (
      id TEXT,
      lab_id TEXT,
      title TEXT NOT NULL,
      team TEXT,
      location TEXT,
      type TEXT,
      compensation TEXT,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      PRIMARY KEY (id, lab_id),
      FOREIGN KEY (lab_id) REFERENCES labs(id)
    )
  `);
  
  db.run(`
    CREATE TABLE job_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      lab_id TEXT,
      job_count INTEGER,
      UNIQUE(date, lab_id)
    )
  `);
}

// Lab configuration with data fetching logic
const LABS = {
  openai: {
    name: 'OpenAI',
    color: '#10a37f', // OpenAI green
    fetchData: async () => {
      const response = await fetch('https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apollographql-client-name': 'frontend_non_user',
          'apollographql-client-version': '0.1.0',
        },
        body: JSON.stringify({
          operationName: 'ApiJobBoardWithTeams',
          variables: { organizationHostedJobsPageName: 'openai' },
          query: `
            query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
              jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
                teams {
                  id
                  name
                  parentTeamId
                }
                jobPostings {
                  id
                  title
                  teamId
                  locationName
                  employmentType
                  compensationTierSummary
                }
              }
            }
          `,
        }),
      });
      const data = await response.json();
      return data;
    },
    transformData: (data) => {
      const teams = data.data.jobBoard.teams.reduce((acc, team) => {
        acc[team.id] = team.name;
        return acc;
      }, {});
      
      return data.data.jobBoard.jobPostings.map(job => ({
        id: job.id,
        lab_id: 'openai',
        title: job.title,
        team: teams[job.teamId] || 'Unknown Team',
        location: job.locationName || 'Remote',
        type: job.employmentType || 'Unknown',
        compensation: job.compensationTierSummary || 'Not specified'
      }));
    }
  },
  anthropic: {
    name: 'Anthropic',
    color: '#6b5ce7', // Anthropic purple
    fetchData: async () => {
      const response = await fetch('https://boards-api.greenhouse.io/v1/boards/anthropic/departments');
      return await response.json();
    },
    transformData: (data) => {
      return data.departments.flatMap(dept => 
        dept.jobs.map(job => ({
          id: job.id.toString(),
          lab_id: 'anthropic',
          title: job.title,
          team: dept.name,
          location: job.location?.name || 'Remote',
          type: 'FullTime', // Greenhouse doesn't always specify this
          compensation: 'Not specified' // Greenhouse doesn't provide this
        }))
      );
    }
  },
  // Add more labs here following the same pattern
};

// Initialize labs in database
Object.entries(LABS).forEach(([id, lab]) => {
  const stmt = db.prepare('INSERT OR IGNORE INTO labs (id, name, color) VALUES (?, ?, ?)');
  stmt.run(id, lab.name, lab.color);
});

// Function to update job database
async function updateJobsDatabase() {
  console.log('Updating jobs database...');
  const today = new Date().toISOString().split('T')[0];
  
  // Mark all jobs as inactive - we'll mark them active again if they're still listed
  db.run('UPDATE jobs SET is_active = 0 WHERE is_active = 1');
  
  // Process each lab
  for (const [labId, lab] of Object.entries(LABS)) {
    try {
      console.log(`Fetching jobs for ${lab.name}...`);
      const rawData = await lab.fetchData();
      const jobs = lab.transformData(rawData);
      console.log(`Found ${jobs.length} jobs for ${lab.name}`);
      
      // Insert job history record
      const historyStmt = db.prepare('INSERT OR REPLACE INTO job_history (date, lab_id, job_count) VALUES (?, ?, ?)');
      historyStmt.run(today, labId, jobs.length);
      
      // Update each job
      const jobStmt = db.prepare(`
        INSERT INTO jobs (id, lab_id, title, team, location, type, compensation, last_seen, is_active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(id, lab_id) DO UPDATE SET 
          title = excluded.title,
          team = excluded.team,
          location = excluded.location,
          type = excluded.type,
          compensation = excluded.compensation,
          last_seen = CURRENT_TIMESTAMP,
          is_active = 1
      `);
      
      for (const job of jobs) {
        jobStmt.run(
          job.id,
          job.lab_id,
          job.title,
          job.team,
          job.location,
          job.type,
          job.compensation
        );
      }
      
      // Update lab's last_updated timestamp
      db.run('UPDATE labs SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [labId]);
      
    } catch (error) {
      console.error(`Error updating jobs for ${lab.name}:`, error);
    }
  }
  
  console.log('Database update complete');
}

// Schedule daily updates
const HOUR = 60 * 60 * 1000;
setInterval(updateJobsDatabase, 24 * HOUR);

// Initial database update
updateJobsDatabase();

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve static files
    if (url.pathname === '/') {
      return new Response(Bun.file('./index.html'));
    } else if (url.pathname === '/index.js') {
      return new Response(Bun.file('./index.js'));
    } else if (url.pathname === '/index.css') {
      return new Response(Bun.file('./index.css'));
    }

    // API endpoints
    if (url.pathname === '/api/labs') {
      const labs = db.query('SELECT id, name, color FROM labs').all();
      return new Response(JSON.stringify(labs), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/jobs') {
      // Get active jobs with additional info
      const jobs = db.query(`
        SELECT j.*, l.name as lab_name, l.color as lab_color
        FROM jobs j
        JOIN labs l ON j.lab_id = l.id
        WHERE j.is_active = 1
        ORDER BY j.first_seen DESC
      `).all();
      
      return new Response(JSON.stringify(jobs), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/new-jobs') {
      // Get jobs added in the last 7 days
      const recentJobs = db.query(`
        SELECT j.*, l.name as lab_name, l.color as lab_color
        FROM jobs j
        JOIN labs l ON j.lab_id = l.id
        WHERE j.is_active = 1 AND j.first_seen >= datetime('now', '-7 days')
        ORDER BY j.first_seen DESC
      `).all();
      
      return new Response(JSON.stringify(recentJobs), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/removed-jobs') {
      // Get jobs that were recently removed (inactive within last 30 days)
      const removedJobs = db.query(`
        SELECT j.*, l.name as lab_name, l.color as lab_color
        FROM jobs j
        JOIN labs l ON j.lab_id = l.id
        WHERE j.is_active = 0 AND j.last_seen >= datetime('now', '-30 days')
        ORDER BY j.last_seen DESC
      `).all();
      
      return new Response(JSON.stringify(removedJobs), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/history') {
      // Get historical job counts
      const history = db.query(`
        SELECT h.date, h.lab_id, h.job_count, l.name as lab_name, l.color as lab_color
        FROM job_history h
        JOIN labs l ON h.lab_id = l.id
        ORDER BY h.date ASC
      `).all();
      
      return new Response(JSON.stringify(history), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/trends') {
      // Calculate job posting trends
      const trends = db.query(`
        WITH current_counts AS (
          SELECT lab_id, COUNT(*) as count
          FROM jobs
          WHERE is_active = 1
          GROUP BY lab_id
        ),
        week_ago_counts AS (
          SELECT h.lab_id, h.job_count as count
          FROM job_history h
          JOIN (
            SELECT lab_id, MAX(date) as date
            FROM job_history
            WHERE date <= date('now', '-7 days')
            GROUP BY lab_id
          ) latest ON h.lab_id = latest.lab_id AND h.date = latest.date
        )
        SELECT 
          c.lab_id, 
          l.name as lab_name,
          l.color as lab_color,
          c.count as current_count,
          w.count as week_ago_count,
          c.count - COALESCE(w.count, 0) as difference,
          CASE 
            WHEN w.count > 0 THEN ROUND((c.count - w.count) * 100.0 / w.count, 1)
            ELSE NULL
          END as percentage_change
        FROM current_counts c
        LEFT JOIN week_ago_counts w ON c.lab_id = w.lab_id
        JOIN labs l ON c.lab_id = l.id
      `).all();
      
      return new Response(JSON.stringify(trends), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/locations') {
      // Get job counts by location
      const locations = db.query(`
        SELECT location, COUNT(*) as count
        FROM jobs
        WHERE is_active = 1
        GROUP BY location
        ORDER BY count DESC
      `).all();
      
      return new Response(JSON.stringify(locations), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/api/teams') {
      // Get job counts by team
      const teams = db.query(`
        SELECT team, COUNT(*) as count
        FROM jobs
        WHERE is_active = 1
        GROUP BY team
        ORDER BY count DESC
      `).all();
      
      return new Response(JSON.stringify(teams), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log('Server running at http://localhost:3000');