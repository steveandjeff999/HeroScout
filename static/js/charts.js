// Chart-related functionality

let currentChart = null;
let usedColors = new Set();

// Get a distinct color from our palette or generate a random one if all used
function getDistinctColor(alpha = 1) {
    // If all colors are used, generate a random color instead of reusing
    if (usedColors.size >= CHART_COLORS.length) {
        // Generate a random color that hasn't been used yet
        let newColor;
        do {
            newColor = getRandomColor();
        } while (usedColors.has(newColor));
        
        usedColors.add(newColor);
        
        if (alpha < 1) {
            return newColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
        }
        return newColor;
    }

    // Find an unused color from our palette
    for (let color of CHART_COLORS) {
        if (!usedColors.has(color)) {
            usedColors.add(color);
            if (alpha < 1) {
                // For semi-transparent, add alpha to hex color
                return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
            }
            return color;
        }
    }
}

// Create a chart with the given parameters
function createChart(type, datasets, labels) {
    const ctx = document.getElementById('team_chart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }

    const metric = $('#chart_metric').val();
    
    // Special y-axis configuration for rate metrics
    const yAxisConfig = (metric === 'defense_rating') ? 
        {
            beginAtZero: true,
            max: 100, // For percentage
            ticks: {
                color: 'white',
                callback: function(value) {
                    return value + '%'; // Add percent sign to y-axis
                }
            },
            grid: {
                color: 'rgba(255, 255, 255, 0.1)'
            }
        } :
        {
            beginAtZero: true,
            ticks: {
                color: 'white'
            },
            grid: {
                color: 'rgba(255, 255, 255, 0.1)'
            }
        };

    const config = {
        type: type,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: yAxisConfig,
                x: {
                    ticks: {
                        color: 'white'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'white'
                    }
                },
                title: {
                    display: true,
                    text: getChartTitle(),
                    color: 'white',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        // Add percent for rate metrics tooltips
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let value = context.raw;
                            if (metric === 'defense_rating' && labels.length > 1) {
                                return label + ': ' + value + '%';
                            } else {
                                return label + ': ' + value;
                            }
                        }
                    }
                }
            },
            spanGaps: true // This option allows the line to pass over null values
        }
    };

    currentChart = new Chart(ctx, config);
}

// Create a pie chart with all teams
function createPieChart(processedData) {
    const ctx = document.getElementById('team_chart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }

    const metric = $('#chart_metric').val();
    
    // For pie charts, we need the sum or average for each team
    let teamScores = [];
    
    if (metric === 'defense_rating') {
        // For defense rating, we want to show a pie chart of which teams performed the most defense
        teamScores = processedData.map(teamData => {
            return {
                team: teamData.team,
                value: teamData.values.length > 0 ? teamData.values[0] : 0
            };
        });
    } else {
        // For scoring metrics, use the existing calculation
        teamScores = processedData.map(teamData => {
            // Sum values for each team
            const sum = teamData.values.reduce((total, val) => total + val, 0);
            const avg = teamData.values.length > 0 ? sum / teamData.values.length : 0;
            return {
                team: teamData.team,
                value: avg
            };
        });
    }
    
    // Include teams with zero value
    const validTeamScores = teamScores.map(team => ({
        team: team.team,
        value: team.value || 0
    }));
    
    // Sort teams by value (descending) for better visualization
    validTeamScores.sort((a, b) => b.value - a.value);
    
    // Prepare data for the pie chart
    const labels = validTeamScores.map(team => `Team ${parseInt(team.team)}`);
    const data = validTeamScores.map(team => team.value);
    
    // Clear used colors to ensure we get fresh colors for this chart
    usedColors.clear();
    
    // Generate distinct colors for each team in the pie chart
    const backgroundColors = validTeamScores.map(() => getDistinctColor(0.8));
    const borderColors = validTeamScores.map((_, i) => backgroundColors[i].substring(0, 7));  // Remove alpha if present
    
    // Create a more descriptive title for broke rate
    let chartTitle = getChartTitle();
    let tooltipFormatter;
    
    if (metric === 'defense_rating') {
        // Format tooltip for rate metrics to show percentage
        tooltipFormatter = function(context) {
            const value = context.raw;
            const label = context.label || '';
            const total = data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${label}: ${value}% (${percentage}% of total)`;
        };
    } else {
        // Default tooltip for other metrics
        tooltipFormatter = function(context) {
            const value = context.raw;
            const label = context.label || '';
            return `${label}: ${value.toFixed(1)} points`;
        };
    }
    
    const config = {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: 'white',
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    const value = data.datasets[0].data[i];
                                    
                                    return {
                                        text: `${label} (${value.toFixed(1)})`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: isNaN(value) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: tooltipFormatter
                    }
                },
                title: {
                    display: true,
                    text: chartTitle,
                    color: 'white',
                    font: {
                        size: 16
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true
            }
        }
    };

    currentChart = new Chart(ctx, config);
}

// Calculate metric data for charts
function calculateMetricData(matchData, metric) {
    if (!Array.isArray(matchData)) {
        throw new Error('Invalid match data format');
    }

    const dataGrouping = $('#data_grouping').val();
    const chartType = $('#chart_type').val();

    let values = [], labels = [];

    // Sort the match data by Match number to ensure chronological order
    matchData.sort((a, b) => {
        // Handle different column names for match number
        const matchA = parseInt(a['Match Number'] || a['Match'] || 0);
        const matchB = parseInt(b['Match Number'] || b['Match'] || 0);
        return matchA - matchB;
    });

    // Get match labels based on either Match Number or Match columns
    const getMatchLabel = (match) => {
        const matchNum = match['Match Number'] || match['Match'];
        return `Match ${matchNum}`;
    };

    // Helper function to get column value with fallbacks for alternative column names
    function getColumnValue(match, primaryCol, alternativeCols = []) {
        if (match[primaryCol] !== undefined) {
            return match[primaryCol];
        }
        
        for (let altCol of alternativeCols) {
            if (match[altCol] !== undefined) {
                return match[altCol];
            }
        }
        
        return 0; // Default to 0 if no column is found
    }

    // Helper to handle calculating auto score with various column mappings
    function calculateAutoScore(match) {
        let score = 0;
        
        // Leave bonus
        if (match['Leave Bonus (T/F)']) {
            score += 3;
        }
        
        // Auto Coral - handle both combined and separate L2/L3 columns
        score += (getColumnValue(match, 'Auto Coral L1 (#)') || 0) * 3;
        
        // Check if we have combined L2/L3 or separate columns
        if (match['Auto Coral L2/L3 (#)'] !== undefined) {
            score += (match['Auto Coral L2/L3 (#)'] || 0) * 5;
        } else {
            score += (getColumnValue(match, 'Auto Coral L2 (#)') || 0) * 4;
            score += (getColumnValue(match, 'Auto Coral L3 (#)') || 0) * 6;
        }
        
        score += (getColumnValue(match, 'Auto Coral L4 (#)') || 0) * 7;
        score += (getColumnValue(match, 'Auto Coral Unclear (#)') || 0) * 4;
        
        // Auto Algae - handle different column names
        score += (getColumnValue(match, 'Auto Algae Net (#)', ['Auto Barge Algae']) || 0) * 4;
        score += (getColumnValue(match, 'Auto Algae Processor (#)', ['Auto Processor Algae']) || 0) * 6;
        
        return score;
    }

    // Helper to handle calculating teleop score with various column mappings
    function calculateTeleopScore(match) {
        let score = 0;
        
        // Coral - handle both combined and separate L2/L3 columns
        score += (getColumnValue(match, 'Coral L1 (#)') || 0) * 2;
        
        if (match['Coral L2/L3 (#)'] !== undefined) {
            score += (match['Coral L2/L3 (#)'] || 0) * 3.5;
        } else {
            score += (getColumnValue(match, 'Coral L2 (#)') || 0) * 3;
            score += (getColumnValue(match, 'Coral L3 (#)') || 0) * 4;
        }
        
        score += (getColumnValue(match, 'Coral L4 (#)') || 0) * 5;
        score += (getColumnValue(match, 'Coral Unclear (#)') || 0) * 3;
        
        // Algae - handle different column names
        score += (getColumnValue(match, 'Algae Net (#)', ['Barge Algae']) || 0) * 4;
        score += (getColumnValue(match, 'Algae Processor (#)', ['processor Algae']) || 0) * 6;
        
        // Endgame barge
        const bargeValue = getColumnValue(match, 'Endgame Barge');
        if (typeof bargeValue === 'number') {
            const bargeKey = Math.round(bargeValue);
            if (bargeKey === 1) score += 2;
            else if (bargeKey === 2) score += 6;
            else if (bargeKey === 3) score += 12;
        }
        
        return score;
    }

    if (dataGrouping === 'average' || chartType === 'radar') {
        // Calculate average for the team
        switch(metric) {
            case 'total_score':
                const totalScores = matchData.map(match => calculateAutoScore(match) + calculateTeleopScore(match));
                values = [totalScores.reduce((a, b) => a + b, 0) / totalScores.length];
                labels = ['Average'];
                break;
            case 'auto_score':
                const autoScores = matchData.map(match => calculateAutoScore(match));
                values = [autoScores.reduce((a, b) => a + b, 0) / autoScores.length];
                labels = ['Average'];
                break;
            case 'teleop_score':
                const teleopScores = matchData.map(match => calculateTeleopScore(match));
                values = [teleopScores.reduce((a, b) => a + b, 0) / teleopScores.length];
                labels = ['Average'];
                break;
            case 'defense_rating':
                // Average defense rating (0-100 scale)
                const defenseRatings = matchData.map(match => match['Defense Performed'] || 0);
                const validRatings = defenseRatings.filter(rating => rating > 0);
                values = [validRatings.length > 0 ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length : 0];
                labels = ['Average'];
                break;
            default:
                values = [0];
                labels = ['N/A'];
                break;
        }
    } else {
        // Match by match data - use the actual Match numbers from the data
        switch(metric) {
            case 'total_score':
                matchData.forEach(match => {
                    values.push(calculateAutoScore(match) + calculateTeleopScore(match));
                    labels.push(getMatchLabel(match));
                });
                break;
            case 'auto_score':
                matchData.forEach(match => {
                    values.push(calculateAutoScore(match));
                    labels.push(getMatchLabel(match));
                });
                break;
            case 'teleop_score':
                matchData.forEach(match => {
                    values.push(calculateTeleopScore(match));
                    labels.push(getMatchLabel(match));
                });
                break;
            case 'defense_rating':
                // Defense rating (0-100 scale)
                matchData.forEach(match => {
                    values.push(match['Defense Performed'] || 0);
                    labels.push(getMatchLabel(match));
                });
                break;
            default:
                values = [0];
                labels = ['N/A'];
                break;
        }
    }

    // Make sure we're actually returning the labels array - this was likely the issue
    return { values, labels };
}
