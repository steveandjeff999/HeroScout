// Utility functions for the application

// Loading spinner management
function showSpinner() {
    $('#loadingSpinner').css('display', 'flex');
}

function hideSpinner() {
    $('#loadingSpinner').css('display', 'none');
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to escape HTML 
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper function to highlight text
function highlightText(text, term) {
    if (!term) return text;
    
    const escapedTerm = escapeRegExp(term);
    const regex = new RegExp('(' + escapedTerm + ')', 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Get a random color with specified alpha
function getRandomColor(alpha = 1) {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    if (alpha < 1) {
        return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    }
    return color;
}

// Function to get barge position name from value
function getBargeName(value) {
    const intValue = parseInt(value);
    if (intValue === 1) return 'Parked (1)';
    if (intValue === 2) return 'Shallow Climb (2)';
    if (intValue === 3) return 'Deep Climb (3)';
    return 'None (0)';
}

// Get a descriptive chart title based on selected metric
function getChartTitle() {
    const metric = $('#chart_metric').val();
    const metricLabels = {
        'total_score': 'Team Total Scores',
        'auto_score': 'Team Auto Scores',
        'teleop_score': 'Team Teleop Scores',
        'defense_rating': 'Team Defense Rating'
    };
    return metricLabels[metric] || 'Team Performance';
}
