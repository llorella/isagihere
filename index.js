// Global state
let jobsData = [];
let labsConfig = [];
let filteredJobs = [];
let charts = {};
let tooltipElement = null;

// Initialize the application
async function init() {
  try {
    // Set up tooltip element
    setupTooltip();
    
    // Show loading state
    showLoading();
    
    // Fetch labs configuration
    const labsResponse = await fetch('/api/labs');
    labsConfig = await labsResponse.json();
    
    // Fetch all jobs
    const jobsResponse = await fetch('/api/jobs');
    jobsData = await jobsResponse.json();
    filteredJobs = [...jobsData];
    
    // Fetch new and removed jobs
    const newJobsResponse = await fetch('/api/new-jobs');
    const newJobs = await newJobsResponse.json();
    
    const removedJobsResponse = await fetch('/api/removed-jobs');
    const removedJobs = await removedJobsResponse.json();
    
    // Fetch trends and history data
    const trendsResponse = await fetch('/api/trends');
    const trendsData = await trendsResponse.json();
    
    const historyResponse = await fetch('/api/history');
    const historyData = await historyResponse.json();
    
    // Fetch location and team data
    const locationsResponse = await fetch('/api/locations');
    const locationsData = await locationsResponse.json();
    
    const teamsResponse = await fetch('/api/teams');
    const teamsData = await teamsResponse.json();
    
    // Hide loading state
    hideLoading();
    
    // Initialize UI
    populateFilterOptions();
    updateStats(newJobs.length, removedJobs.length);
    renderJobCards();
    
    // Initialize visualizations
    initHistoricalChart(historyData);
    initTeamsChart(teamsData);
    initLabsChart();
    renderLocationMap(locationsData);
    renderTrendsTable(trendsData);
    
    // Setup event listeners
    setupEventListeners();
    
    // Set last updated time
    updateLastUpdatedTime();
    
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Add visual flair animations
    animateElements();
  } catch (error) {
    console.error('Failed to initialize:', error);
    hideLoading();
    document.body.innerHTML = `<div class="error-message">
      <h2>Failed to load data</h2>
      <p>Please try refreshing the page.</p>
      <p class="error-details">${error.message}</p>
    </div>`;
  }
}

// Show loading state
function showLoading() {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading';
  loadingEl.id = 'loading-indicator';
  document.body.appendChild(loadingEl);
}

// Hide loading state
function hideLoading() {
  const loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) {
    loadingEl.remove();
  }
}

// Set up tooltip element
function setupTooltip() {
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'tooltip';
  tooltipElement.style.opacity = '0';
  tooltipElement.style.display = 'none';
  document.body.appendChild(tooltipElement);
}

// Show tooltip
function showTooltip(content, x, y) {
  tooltipElement.innerHTML = content;
  tooltipElement.style.display = 'block';
  
  // Position tooltip
  const tooltipWidth = tooltipElement.offsetWidth;
  const tooltipHeight = tooltipElement.offsetHeight;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Adjust position to ensure tooltip is within viewport
  let tooltipX = x + 10;
  if (tooltipX + tooltipWidth > windowWidth) {
    tooltipX = x - tooltipWidth - 10;
  }
  
  let tooltipY = y + 10;
  if (tooltipY + tooltipHeight > windowHeight) {
    tooltipY = y - tooltipHeight - 10;
  }
  
  tooltipElement.style.left = `${tooltipX}px`;
  tooltipElement.style.top = `${tooltipY}px`;
  tooltipElement.style.opacity = '1';
}

// Hide tooltip
function hideTooltip() {
  tooltipElement.style.opacity = '0';
  setTimeout(() => {
    tooltipElement.style.display = 'none';
  }, 300);
}

// Update last updated time
function updateLastUpdatedTime() {
  const now = new Date();
  document.getElementById('update-time').textContent = now.toLocaleString();
}

// Populate filter dropdowns
function populateFilterOptions() {
  // Populate labs filter
  const labFilter = document.getElementById('lab-filter');
  labsConfig.forEach(lab => {
    const option = document.createElement('option');
    option.value = lab.id;
    option.textContent = lab.name;
    labFilter.appendChild(option);
  });
  
  // Populate teams filter
  const teamFilter = document.getElementById('team-filter');
  const uniqueTeams = [...new Set(jobsData.map(job => job.team))].sort();
  uniqueTeams.forEach(team => {
    const option = document.createElement('option');
    option.value = team;
    option.textContent = team;
    teamFilter.appendChild(option);
  });
  
  // Populate locations filter
  const locationFilter = document.getElementById('location-filter');
  const uniqueLocations = [...new Set(jobsData.map(job => job.location))].sort();
  uniqueLocations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    locationFilter.appendChild(option);
  });
}

// Update stats section
function updateStats(newJobsCount, removedJobsCount) {
  document.getElementById('total-jobs').textContent = jobsData.length;
  document.getElementById('new-jobs').textContent = newJobsCount;
  document.getElementById('removed-jobs').textContent = removedJobsCount;
  document.getElementById('job-count').textContent = `(${filteredJobs.length} of ${jobsData.length})`;
}

// Render job cards
function renderJobCards() {
  const container = document.getElementById('jobs-container');
  container.innerHTML = '';
  
  if (filteredJobs.length === 0) {
    container.innerHTML = '<div class="no-jobs">No jobs match your filters. Try adjusting your search criteria.</div>';
    return;
  }
  
  filteredJobs.forEach(job => {
    const card = document.createElement('div');
    card.className = 'job-card';
    
    // Add appropriate class based on job status
    const firstSeenDate = new Date(job.first_seen);
    const lastSeenDate = new Date(job.last_seen);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    if (job.is_active === 0) {
      card.classList.add('removed-job');
    } else if (firstSeenDate > sevenDaysAgo) {
      card.classList.add('new-job');
    }
    
    // Add lab indicator
    const labIndicator = document.createElement('div');
    labIndicator.className = 'lab-indicator';
    labIndicator.style.backgroundColor = job.lab_color || '#888';
    card.appendChild(labIndicator);
    
    // Lab badge
    const labBadge = document.createElement('div');
    labBadge.className = 'lab-badge';
    labBadge.textContent = job.lab_name;
    labBadge.style.backgroundColor = `${job.lab_color}30`; // 30 is hex for 19% opacity
    labBadge.style.color = job.lab_color;
    card.appendChild(labBadge);
    
    // Job title
    const title = document.createElement('h3');
    title.textContent = job.title;
    card.appendChild(title);
    
    // Job details
    const teamDetail = document.createElement('p');
    teamDetail.innerHTML = `<strong>Team:</strong> ${job.team}`;
    card.appendChild(teamDetail);
    
    const locationDetail = document.createElement('p');
    locationDetail.innerHTML = `<strong>Location:</strong> ${job.location}`;
    card.appendChild(locationDetail);
    
    if (job.type) {
      const typeDetail = document.createElement('p');
      typeDetail.innerHTML = `<strong>Type:</strong> ${job.type}`;
      card.appendChild(typeDetail);
    }
    
    if (job.compensation && job.compensation !== 'Not specified') {
      const compensationDetail = document.createElement('p');
      compensationDetail.innerHTML = `<strong>Compensation:</strong> ${job.compensation}`;
      card.appendChild(compensationDetail);
    }
    
    // Add date info
    const dateInfo = document.createElement('div');
    dateInfo.className = 'job-date';
    
    if (job.is_active === 0) {
      dateInfo.textContent = `Removed: ${new Date(job.last_seen).toLocaleDateString()}`;
    } else {
      dateInfo.textContent = `Posted: ${new Date(job.first_seen).toLocaleDateString()}`;
    }
    
    card.appendChild(dateInfo);
    
    container.appendChild(card);
  });
}

// Initialize historical chart
function initHistoricalChart(historyData) {
  const ctx = document.getElementById('history-chart').getContext('2d');
  
  // Process data for chart
  const labels = [...new Set(historyData.map(item => item.date))].sort();
  const datasets = [];
  
  // Group by lab
  const labGroups = {};
  historyData.forEach(item => {
    if (!labGroups[item.lab_id]) {
      labGroups[item.lab_id] = {
        label: item.lab_name,
        backgroundColor: hexToRgba(item.lab_color, 0.2),
        borderColor: item.lab_color,
        data: [],
        pointRadius: 3,
        tension: 0.1
      };
    }
  });
  
  // Fill in data for each lab and date
  labels.forEach(date => {
    Object.keys(labGroups).forEach(labId => {
      const dataPoint = historyData.find(item => item.date === date && item.lab_id === labId);
      labGroups[labId].data.push(dataPoint ? dataPoint.job_count : null);
    });
  });
  
  // Convert to array of datasets
  datasets.push(...Object.values(labGroups));
  
  charts.historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: 'rgba(224, 224, 255, 0.7)'
          }
        },
        tooltip: {
          callbacks: {
            title: function(tooltipItems) {
              const date = new Date(tooltipItems[0].label);
              return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              });
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            displayFormats: {
              day: 'MMM d'
            }
          },
          ticks: {
            color: 'rgba(224, 224, 255, 0.7)'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(224, 224, 255, 0.7)'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        }
      }
    }
  });
}

// Initialize teams chart
function initTeamsChart(teamsData) {
  const ctx = document.getElementById('teams-chart').getContext('2d');
  
  // Sort and take top 10 teams
  const topTeams = teamsData
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  charts.teamsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topTeams.map(t => t.team),
      datasets: [{
        label: 'Jobs',
        data: topTeams.map(t => t.count),
        backgroundColor: 'rgba(88, 166, 255, 0.7)',
        borderColor: 'rgba(88, 166, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(224, 224, 255, 0.7)'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        y: {
          ticks: {
            color: 'rgba(224, 224, 255, 0.7)'
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Initialize labs chart
function initLabsChart() {
  const ctx = document.getElementById('labs-chart').getContext('2d');
  
  // Count jobs by lab
  const labCounts = {};
  jobsData.forEach(job => {
    labCounts[job.lab_id] = (labCounts[job.lab_id] || 0) + 1;
  });
  
  charts.labsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labsConfig.map(lab => lab.name),
      datasets: [{
        data: labsConfig.map(lab => labCounts[lab.id] || 0),
        backgroundColor: labsConfig.map(lab => lab.color),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: 'rgba(224, 224, 255, 0.7)',
            padding: 10
          }
        }
      }
    }
  });
}

// Render trends table
function renderTrendsTable(trendsData) {
  const tableBody = document.getElementById('trends-table-body');
  tableBody.innerHTML = '';
  
  trendsData.forEach(trend => {
    const row = document.createElement('tr');
    
    // Lab name cell with color
    const labCell = document.createElement('td');
    labCell.innerHTML = `<span style="color: ${trend.lab_color}">${trend.lab_name}</span>`;
    row.appendChild(labCell);
    
    // Current count cell
    const currentCell = document.createElement('td');
    currentCell.textContent = trend.current_count;
    row.appendChild(currentCell);
    
    // Week ago count cell
    const weekAgoCell = document.createElement('td');
    weekAgoCell.textContent = trend.week_ago_count || 'N/A';
    row.appendChild(weekAgoCell);
    
    // Change cell with indicator
    const changeCell = document.createElement('td');
    
    if (trend.difference !== 0 && trend.week_ago_count) {
      const changeText = trend.difference > 0 ? `+${trend.difference}` : trend.difference;
      const percentText = trend.percentage_change ? ` (${trend.percentage_change > 0 ? '+' : ''}${trend.percentage_change}%)` : '';
      
      let trendClass = 'trend-neutral';
      if (trend.difference > 0) {
        trendClass = 'trend-up';
      } else if (trend.difference < 0) {
        trendClass = 'trend-down';
      }
      
      changeCell.innerHTML = `${changeText}${percentText} <span class="trend-indicator ${trendClass}"></span>`;
    } else {
      changeCell.textContent = 'No change';
    }
    
    row.appendChild(changeCell);
    
    tableBody.appendChild(row);
  });
}

// Render location map
function renderLocationMap(locationsData) {
  const container = document.getElementById('locations-map');
  container.innerHTML = '';
  
  // Sort locations by count and take top 25
  const topLocations = locationsData
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  
  // Find max count for scaling bubbles
  const maxCount = topLocations[0].count;
  
  // Set up container with relative positioning
  container.style.position = 'relative';
  
  // Create location bubbles
  topLocations.forEach((location, index) => {
    // Calculate size based on job count
    const size = 20 + (location.count / maxCount) * 80;
    
    // Calculate position
    // Use a spiral layout to avoid overlapping
    const theta = index * 2.4; // Angle in radians
    const radius = 30 + 5 * Math.sqrt(index); // Increasing radius
    
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    const x = centerX + radius * Math.cos(theta);
    const y = centerY + radius * Math.sin(theta);
    
    // Create bubble
    const bubble = document.createElement('div');
    bubble.className = 'location-bubble';
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    
    // Use different colors for different bubbles
    const hue = 210 + (index * 15) % 150; // Blue to purple range
    bubble.style.backgroundColor = `hsla(${hue}, 80%, 60%, 0.7)`;
    
    // Position bubble
    bubble.style.left = `${x - size/2}px`;
    bubble.style.top = `${y - size/2}px`;
    
    // Add tooltip on hover
    bubble.addEventListener('mouseenter', (e) => {
      const content = `
        <strong>${location.location}</strong><br>
        ${location.count} job${location.count !== 1 ? 's' : ''}
      `;
      showTooltip(content, e.clientX, e.clientY);
    });
    
    bubble.addEventListener('mouseleave', hideTooltip);
    
    container.appendChild(bubble);
    
    // Add label
    const label = document.createElement('div');
    label.className = 'location-label';
    label.textContent = location.location.split(',')[0]; // Just show city name
    
    // Position label
    label.style.left = `${x}px`;
    label.style.top = `${y + size/2 + 5}px`;
    label.style.transform = 'translateX(-50%)';
    
    container.appendChild(label);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Search functionality
  document.getElementById('job-search').addEventListener('input', filterJobs);
  
  // Filter dropdowns
  document.getElementById('lab-filter').addEventListener('change', filterJobs);
  document.getElementById('team-filter').addEventListener('change', filterJobs);
  document.getElementById('location-filter').addEventListener('change', filterJobs);
  document.getElementById('job-status').addEventListener('change', filterJobs);
  
  // Resize handler for charts
  window.addEventListener('resize', () => {
    if (charts.historyChart) charts.historyChart.resize();
    if (charts.teamsChart) charts.teamsChart.resize();
    if (charts.labsChart) charts.labsChart.resize();
    renderLocationMap(locationsData);
  });
}

// Filter jobs based on search and dropdown selections
async function filterJobs() {
  const searchTerm = document.getElementById('job-search').value.toLowerCase();
  const selectedLab = document.getElementById('lab-filter').value;
  const selectedTeam = document.getElementById('team-filter').value;
  const selectedLocation = document.getElementById('location-filter').value;
  const selectedStatus = document.getElementById('job-status').value;
  
  // Fetch appropriate job list based on status
  let jobsList = [];
  
  if (selectedStatus === 'new') {
    const response = await fetch('/api/new-jobs');
    jobsList = await response.json();
  } else if (selectedStatus === 'removed') {
    const response = await fetch('/api/removed-jobs');
    jobsList = await response.json();
  } else {
    jobsList = [...jobsData];
  }
  
  // Apply filters
  filteredJobs = jobsList.filter(job => {
    // Apply search filter
    const matchesSearch = 
      searchTerm === '' || 
      job.title.toLowerCase().includes(searchTerm) ||
      job.team.toLowerCase().includes(searchTerm);
    
    // Apply dropdown filters
    const matchesLab = selectedLab === 'all' || job.lab_id === selectedLab;
    const matchesTeam = selectedTeam === 'all' || job.team === selectedTeam;
    const matchesLocation = selectedLocation === 'all' || job.location === selectedLocation;
    
    return matchesSearch && matchesLab && matchesTeam && matchesLocation;
  });
  
  // Update the display
  document.getElementById('job-count').textContent = `(${filteredJobs.length} of ${jobsList.length})`;
  renderJobCards();
}

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Add visual flair and animations
function animateElements() {
  // Staggered fade-in for job cards
  const cards = document.querySelectorAll('.job-card');
  cards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    
    setTimeout(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 100 + index * 50);
  });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);