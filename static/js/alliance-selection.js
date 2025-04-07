/**
 * Alliance Selection Tool
 * Provides functionality for alliance selection planning and recommendations
 */

// Add jQuery UI library to enable draggable and droppable functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check if jQuery UI is already loaded
    if (typeof $.fn.draggable !== 'function' || typeof $.fn.droppable !== 'function') {
        console.log('Loading jQuery UI library...');
        var script = document.createElement('script');
        script.src = 'https://code.jquery.com/ui/1.12.1/jquery-ui.min.js';
        script.integrity = 'sha256-VazP97ZCwtekAsvgPBSUwPFKdrwD3unUfSGVYrahUqU=';
        script.crossOrigin = 'anonymous';
        script.onload = function() {
            console.log('jQuery UI loaded successfully');
            // Initialize any functionality that requires jQuery UI
            if (document.getElementById('defense_list')) {
                updateDefenseList();
            }
        };
        script.onerror = function() {
            console.error('Failed to load jQuery UI library');
        };
        document.head.appendChild(script);
        
        // Add jQuery UI CSS
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css';
        document.head.appendChild(link);
    }
});

// Global variables to track alliance selection state
const allianceSelectionState = {
    availableTeams: [],
    selectedTeams: {},
    teamData: {},
    teamRankings: {},
    defenseTeamRankings: {}, // Added for defense team rankings
    teamRankingsWithMatchCounts: {}, // Added for rankings with match counts
    myTeamNumber: null,
    doNotPickList: [], // Added for "Do Not Pick" list
    defenseList: [], // Changed to support ranked defense teams
    avoidList: [], // Added for "Avoid" list
    allianceColors: [
        'danger',    // Alliance 1 - Red
        'primary',   // Alliance 2 - Blue
        'success',   // Alliance 3 - Green
        'warning',   // Alliance 4 - Yellow
        'info',      // Alliance 5 - Light Blue
        'secondary', // Alliance 6 - Gray
        'dark',      // Alliance 7 - Dark Gray
        'dark'       // Alliance 8 - Dark Gray
    ],
    lastSyncTimestamp: 0,
    syncInterval: null,
    isSyncEnabled: true
};

// Initialize the alliance selection tool
function initAllianceSelection() {
    console.log('Initializing alliance selection tool...');
    
    // Load all available teams
    loadAllTeamsForAlliance();
    
    // Load the "Do Not Pick" list
    loadDoNotPickList();
    
    // Load the "Avoid" list
    loadAvoidList();
    
    // Load the Defense list
    loadDefenseList();
    
    // Set up event handlers
    setupAllianceEventHandlers();
    
    // Start alliance synchronization
    startAllianceSync();
}

// Load all available teams
function loadAllTeamsForAlliance() {
    showSpinner();
    $.get('/get_all_teams', function(data) {
        hideSpinner();
        if (data.teams && Array.isArray(data.teams)) {
            // Store the team list
            allianceSelectionState.availableTeams = [...data.teams];
            
            // Update the UI
            updateAvailableTeamsList();
            
            // Update counter
            $('#available_team_count').text(`${data.teams.length} teams`);
        } else {
            $('#available_teams_list').html('<div class="alert alert-warning">Failed to load team list</div>');
        }
    }).fail(function(jqXHR, textStatus) {
        hideSpinner();
        $('#available_teams_list').html('<div class="alert alert-danger">Error loading teams: ' + textStatus + '</div>');
    });
}

// Load the "Do Not Pick" list from the server
function loadDoNotPickList() {
    $.get('/load_do_not_pick_list', function(data) {
        if (data.teams) {
            allianceSelectionState.doNotPickList = data.teams;
            updateDoNotPickList();
            console.log(`Loaded ${data.teams.length} teams to "Do Not Pick" list`);
        }
    }).fail(function(jqXHR, textStatus) {
        console.error('Error loading "Do Not Pick" list:', textStatus);
    });
}

// Save the "Do Not Pick" list to the server
function saveDoNotPickList() {
    $.post('/save_do_not_pick_list', { 
        'teams[]': allianceSelectionState.doNotPickList 
    }, function(data) {
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast('Error saving "Do Not Pick" list', 'danger');
        }
    }).fail(function(jqXHR, textStatus) {
        showToast('Error saving "Do Not Pick" list: ' + textStatus, 'danger');
    });
}

// Update the "Do Not Pick" list in the UI
function updateDoNotPickList() {
    const $list = $('#do_not_pick_list');
    $list.empty();
    
    if (allianceSelectionState.doNotPickList.length === 0) {
        $list.html('<div class="text-center text-muted">No teams in "Do Not Pick" list</div>');
        return;
    }
    
    // Sort teams numerically
    const sortedTeams = [...allianceSelectionState.doNotPickList].sort((a, b) => parseInt(a) - parseInt(b));
    
    // Create team items
    sortedTeams.forEach(team => {
        const $teamItem = $(`
            <div class="do-not-pick-item">
                <span class="team-number">Team ${team}</span>
                <button class="btn btn-sm btn-outline-danger remove-dnp-btn" data-team="${team}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `);
        
        $list.append($teamItem);
    });
    
    // Update counter
    $('#do_not_pick_count').text(`${sortedTeams.length} teams`);
}

// Add a team to the "Do Not Pick" list
function addTeamToDoNotPickList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Check if already in the list
    if (allianceSelectionState.doNotPickList.includes(teamNumber)) {
        showToast(`Team ${teamNumber} is already in the "Do Not Pick" list`, 'warning');
        return;
    }
    
    // Add to the list
    allianceSelectionState.doNotPickList.push(teamNumber);
    
    // Update UI
    updateDoNotPickList();
    
    // Save changes
    saveDoNotPickList();
    
    // Update available teams list (to hide the team)
    updateAvailableTeamsList();
    
    showToast(`Added Team ${teamNumber} to "Do Not Pick" list`, 'success');
}

// Remove a team from the "Do Not Pick" list
function removeTeamFromDoNotPickList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Remove from the list
    allianceSelectionState.doNotPickList = allianceSelectionState.doNotPickList.filter(
        team => team !== teamNumber
    );
    
    // Update UI
    updateDoNotPickList();
    
    // Save changes
    saveDoNotPickList();
    
    // Update available teams list (to show the team again)
    updateAvailableTeamsList();
    
    showToast(`Removed Team ${teamNumber} from "Do Not Pick" list`, 'success');
}

// Export the "Do Not Pick" list as a JSON file
function exportDoNotPickList() {
    // Create a JSON string
    const jsonData = JSON.stringify(allianceSelectionState.doNotPickList);
    
    // Create a download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link element and click it
    const a = document.createElement('a');
    a.href = url;
    a.download = 'do_not_pick_list.json';
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    
    showToast('Exported "Do Not Pick" list', 'success');
}

// Import the "Do Not Pick" list from a JSON file
function importDoNotPickList(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedList = JSON.parse(e.target.result);
            
            // Validate that it's an array of numbers
            if (!Array.isArray(importedList)) {
                showToast('Invalid format: not an array', 'danger');
                return;
            }
            
            // Filter to ensure only valid team numbers
            const validTeams = importedList.filter(team => !isNaN(parseInt(team)));
            
            if (validTeams.length === 0) {
                showToast('No valid team numbers found in import file', 'warning');
                return;
            }
            
            // Update the list
            allianceSelectionState.doNotPickList = validTeams.map(team => parseInt(team));
            
            // Update UI
            updateDoNotPickList();
            
            // Save changes
            saveDoNotPickList();
            
            // Update available teams list
            updateAvailableTeamsList();
            
            showToast(`Imported ${validTeams.length} teams to "Do Not Pick" list`, 'success');
            
        } catch (error) {
            showToast('Error importing file: ' + error.message, 'danger');
        }
    };
    
    reader.readAsText(file);
}

// Load the "Avoid" list from the server
function loadAvoidList() {
    $.get('/load_avoid_list', function(data) {
        if (data.teams) {
            allianceSelectionState.avoidList = data.teams;
            updateAvoidList();
            console.log(`Loaded ${data.teams.length} teams to "Avoid" list`);
        }
    }).fail(function(jqXHR, textStatus) {
        console.error('Error loading "Avoid" list:', textStatus);
    });
}

// Save the "Avoid" list to the server
function saveAvoidList() {
    $.post('/save_avoid_list', { 
        'teams[]': allianceSelectionState.avoidList 
    }, function(data) {
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast('Error saving "Avoid" list', 'danger');
        }
    }).fail(function(jqXHR, textStatus) {
        showToast('Error saving "Avoid" list: ' + textStatus, 'danger');
    });
}

// Update the "Avoid" list in the UI
function updateAvoidList() {
    const $list = $('#avoid_list');
    $list.empty();
    
    if (allianceSelectionState.avoidList.length === 0) {
        $list.html('<div class="text-center text-muted">No teams in "Avoid" list</div>');
        return;
    }
    
    // Sort teams numerically
    const sortedTeams = [...allianceSelectionState.avoidList].sort((a, b) => parseInt(a) - parseInt(b));
    
    // Create team items
    sortedTeams.forEach(team => {
        const $teamItem = $(`
            <div class="avoid-item">
                <span class="team-number">Team ${team}</span>
                <button class="btn btn-sm btn-outline-danger remove-avoid-btn" data-team="${team}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `);
        
        $list.append($teamItem);
    });
    
    // Update counter
    $('#avoid_count').text(`${sortedTeams.length} teams`);
}

// Add a team to the "Avoid" list
function addTeamToAvoidList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Check if already in the list
    if (allianceSelectionState.avoidList.includes(teamNumber)) {
        showToast(`Team ${teamNumber} is already in the "Avoid" list`, 'warning');
        return;
    }
    
    // Add to the list
    allianceSelectionState.avoidList.push(teamNumber);
    
    // Update UI
    updateAvoidList();
    
    // Save changes
    saveAvoidList();
    
    // Update available teams list (to reflect avoid status)
    updateAvailableTeamsList();
    
    showToast(`Added Team ${teamNumber} to "Avoid" list`, 'success');
}

// Remove a team from the "Avoid" list
function removeTeamFromAvoidList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Remove from the list
    allianceSelectionState.avoidList = allianceSelectionState.avoidList.filter(
        team => team !== teamNumber
    );
    
    // Update UI
    updateAvoidList();
    
    // Save changes
    saveAvoidList();
    
    // Update available teams list
    updateAvailableTeamsList();
    
    showToast(`Removed Team ${teamNumber} from "Avoid" list`, 'success');
}

// Check if a team is in the avoid list
function isTeamInAvoidList(teamNumber) {
    return allianceSelectionState.avoidList.includes(parseInt(teamNumber));
}

// Export the "Avoid" list as a JSON file
function exportAvoidList() {
    // Create a JSON string
    const jsonData = JSON.stringify(allianceSelectionState.avoidList);
    
    // Create a download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link element and click it
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avoid_list.json';
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    
    showToast('Exported "Avoid" list', 'success');
}

// Import the "Avoid" list from a JSON file
function importAvoidList(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedList = JSON.parse(e.target.result);
            
            // Validate that it's an array of numbers
            if (!Array.isArray(importedList)) {
                showToast('Invalid format: not an array', 'danger');
                return;
            }
            
            // Filter to ensure only valid team numbers
            const validTeams = importedList.filter(team => !isNaN(parseInt(team)));
            
            if (validTeams.length === 0) {
                showToast('No valid team numbers found in import file', 'warning');
                return;
            }
            
            // Update the list
            allianceSelectionState.avoidList = validTeams.map(team => parseInt(team));
            
            // Update UI
            updateAvoidList();
            
            // Save changes
            saveAvoidList();
            
            // Update available teams list
            updateAvailableTeamsList();
            
            showToast(`Imported ${validTeams.length} teams to "Avoid" list`, 'success');
            
        } catch (error) {
            showToast('Error importing file: ' + error.message, 'danger');
        }
    };
    
    reader.readAsText(file);
}

// Load the Defense list from the server
function loadDefenseList() {
    $.get('/load_defense_list', function(data) {
        if (data.teams) {
            // Convert flat array to array of objects with rank
            if (Array.isArray(data.teams) && typeof data.teams[0] === 'number') {
                // Old format - convert to new format
                allianceSelectionState.defenseList = data.teams.map((team, index) => ({
                    team: team,
                    rank: index + 1
                }));
            } else {
                // New format
                allianceSelectionState.defenseList = data.teams;
            }
            updateDefenseList();
            console.log(`Loaded ${allianceSelectionState.defenseList.length} teams to Defense list`);
        }
    }).fail(function(jqXHR, textStatus) {
        console.error('Error loading Defense list:', textStatus);
    });
}

// Save the Defense list to the server
function saveDefenseList() {
    $.post('/save_defense_list', { 
        'teams': JSON.stringify(allianceSelectionState.defenseList)
    }, function(data) {
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast('Error saving Defense list', 'danger');
        }
    }).fail(function(jqXHR, textStatus) {
        showToast('Error saving Defense list: ' + textStatus, 'danger');
    });
}

// Update the Defense list in the UI
function updateDefenseList() {
    const $list = $('#defense_list');
    $list.empty();
    
    if (allianceSelectionState.defenseList.length === 0) {
        $list.html('<div class="text-center text-muted">No teams in Defense list</div>');
        return;
    }
    
    // Sort teams by rank
    const sortedTeams = [...allianceSelectionState.defenseList].sort((a, b) => a.rank - b.rank);
    
    // Create list header
    $list.append(`
        <div class="defense-list-header">
            <div class="rank-column">Rank</div>
            <div class="team-column">Team</div>
            <div class="actions-column">Actions</div>
        </div>
    `);
    
    // Create team items
    sortedTeams.forEach(item => {
        const $teamItem = $(`
            <div class="defense-item" data-team="${item.team}">
                <div class="drag-handle">
                    <i class="fas fa-grip-lines"></i>
                </div>
                <div class="rank-badge">${item.rank}</div>
                <span class="team-number">Team ${item.team}</span>
                <div class="defense-item-actions">
                    <button class="btn remove-defense-btn" data-team="${item.team}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        $list.append($teamItem);
    });
    
    // Update counter
    $('#defense_count').text(`${sortedTeams.length} teams`);
    
    // Enable drag and drop reordering
    enableDefenseListDragDrop();
}

// Enable drag and drop reordering for the defense list
function enableDefenseListDragDrop() {
    const $list = $('#defense_list');
    
    // Make each item draggable
    $list.find('.defense-item').draggable({
        axis: 'y',
        containment: $list,
        handle: '.drag-handle, .rank-badge',
        helper: 'clone',
        opacity: 0.7,
        revert: 'invalid',
        start: function(event, ui) {
            $(this).addClass('dragging');
        },
        stop: function(event, ui) {
            $(this).removeClass('dragging');
        }
    });
    
    // Make each item a drop target
    $list.find('.defense-item').droppable({
        hoverClass: 'drop-hover',
        accept: '.defense-item',
        drop: function(event, ui) {
            const draggedTeam = parseInt(ui.draggable.data('team'));
            const targetTeam = parseInt($(this).data('team'));
            
            if (draggedTeam === targetTeam) return;
            
            // Find indices
            const draggedIndex = allianceSelectionState.defenseList.findIndex(item => item.team === draggedTeam);
            const targetIndex = allianceSelectionState.defenseList.findIndex(item => item.team === targetTeam);
            
            // Reorder the array
            const movedItem = allianceSelectionState.defenseList.splice(draggedIndex, 1)[0];
            allianceSelectionState.defenseList.splice(targetIndex, 0, movedItem);
            
            // Update ranks
            allianceSelectionState.defenseList.forEach((item, idx) => {
                item.rank = idx + 1;
            });
            
            // Update UI
            updateDefenseList();
            
            // Save changes
            saveDefenseList();
        }
    });
}

// Add a team to the Defense list
function addTeamToDefenseList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Check if already in the list
    if (allianceSelectionState.defenseList.some(item => item.team === teamNumber)) {
        showToast(`Team ${teamNumber} is already in the Defense list`, 'warning');
        return;
    }
    
    // Add to the list with the next rank
    const nextRank = allianceSelectionState.defenseList.length + 1;
    allianceSelectionState.defenseList.push({
        team: teamNumber,
        rank: nextRank
    });
    
    // Update UI
    updateDefenseList();
    
    // Save changes
    saveDefenseList();
    
    showToast(`Added Team ${teamNumber} to Defense list`, 'success');
}

// Remove a team from the Defense list
function removeTeamFromDefenseList(teamNumber) {
    // Convert to integer
    teamNumber = parseInt(teamNumber);
    
    // Find and remove the team
    const index = allianceSelectionState.defenseList.findIndex(item => item.team === teamNumber);
    if (index === -1) return;
    
    allianceSelectionState.defenseList.splice(index, 1);
    
    // Update ranks for all teams
    allianceSelectionState.defenseList.forEach((item, idx) => {
        item.rank = idx + 1;
    });
    
    // Update UI
    updateDefenseList();
    
    // Save changes
    saveDefenseList();
    
    showToast(`Removed Team ${teamNumber} from Defense list`, 'success');
}

// Export the Defense list as a JSON file
function exportDefenseList() {
    // Create a JSON string
    const jsonData = JSON.stringify(allianceSelectionState.defenseList);
    
    // Create a download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link element and click it
    const a = document.createElement('a');
    a.href = url;
    a.download = 'defense_list.json';
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    
    showToast('Exported Defense list', 'success');
}

// Import the Defense list from a JSON file
function importDefenseList(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedList = JSON.parse(e.target.result);
            
            // Check format and convert if needed
            if (Array.isArray(importedList)) {
                let validTeams = [];
                
                if (typeof importedList[0] === 'number') {
                    // Old format - convert to new format
                    validTeams = importedList
                        .filter(team => !isNaN(parseInt(team)))
                        .map((team, index) => ({
                            team: parseInt(team),
                            rank: index + 1
                        }));
                } else if (importedList[0] && typeof importedList[0] === 'object' && 'team' in importedList[0]) {
                    // New format - validate
                    validTeams = importedList
                        .filter(item => !isNaN(parseInt(item.team)))
                        .map((item, index) => ({
                            team: parseInt(item.team),
                            rank: item.rank || (index + 1)
                        }));
                    
                    // Sort by rank
                    validTeams.sort((a, b) => a.rank - b.rank);
                    
                    // Re-assign ranks in order
                    validTeams.forEach((item, index) => {
                        item.rank = index + 1;
                    });
                }
                
                if (validTeams.length === 0) {
                    showToast('No valid team numbers found in import file', 'warning');
                    return;
                }
                
                // Update the list
                allianceSelectionState.defenseList = validTeams;
                
                // Update UI
                updateDefenseList();
                
                // Save changes
                saveDefenseList();
                
                showToast(`Imported ${validTeams.length} teams to Defense list`, 'success');
            } else {
                showToast('Invalid format: not an array', 'danger');
            }
        } catch (error) {
            showToast('Error importing file: ' + error.message, 'danger');
        }
    };
    
    reader.readAsText(file);
}

// Check if a team is in the defense list
function isTeamInDefenseList(teamNumber) {
    if (!allianceSelectionState.defenseList || !Array.isArray(allianceSelectionState.defenseList)) {
        return false;
    }
    
    return allianceSelectionState.defenseList.some(item => item.team === parseInt(teamNumber));
}

// Get a team's defense rank (returns -1 if not in defense list)
function getTeamDefenseRank(teamNumber) {
    if (!teamNumber || !allianceSelectionState.defenseList) return -1;
    
    const defenseItem = allianceSelectionState.defenseList.find(item => item.team === teamNumber);
    return defenseItem ? defenseItem.rank : -1;
}

// Save alliance selections to the server
function saveAllianceSelections() {
    if (!allianceSelectionState.isSyncEnabled) return;
    
    $.post('/save_alliance_selections', { 
        'selections': JSON.stringify(allianceSelectionState.selectedTeams) 
    }, function(data) {
        if (data.success) {
            allianceSelectionState.lastSyncTimestamp = data.timestamp;
            updateLastSyncTime();
            console.log('Alliance selections saved successfully');
        } else {
            console.error('Error saving alliance selections');
        }
    }).fail(function(jqXHR, textStatus) {
        console.error('Error saving alliance selections:', textStatus);
    });
}

// Load alliance selections from the server
function loadAllianceSelections() {
    if (!allianceSelectionState.isSyncEnabled) return;
    
    $.get('/load_alliance_selections', function(data) {
        // Only update if the server has newer data
        if (data.timestamp && data.timestamp > allianceSelectionState.lastSyncTimestamp) {
            // Update the timestamp
            allianceSelectionState.lastSyncTimestamp = data.timestamp;
            updateLastSyncTime();
            
            // Check if it's a reset (empty selections)
            const isReset = !data.selections || Object.keys(data.selections).length === 0;
            
            // Check if our local selections are different
            const currentSelections = JSON.stringify(allianceSelectionState.selectedTeams);
            const newSelections = JSON.stringify(data.selections);
            
            if (currentSelections !== newSelections) {
                if (isReset) {
                    console.log('Remote reset detected - clearing all alliance selections');
                    
                    // Clear the state
                    allianceSelectionState.selectedTeams = {};
                    
                    // Clear the UI
                    $('.team-slot').addClass('empty')
                                  .removeClass('filled')
                                  .text('Select team')
                                  .removeData('team')
                                  .find('.remove-team-btn')
                                  .remove();
                    
                    // Update available teams list
                    updateAvailableTeamsList();
                    
                    // Show a toast notification
                    showToast('Alliance selections reset by another user', 'info');
                } else {
                    console.log('Loaded updated alliance selections from server');
                    
                    // Update the state
                    allianceSelectionState.selectedTeams = data.selections;
                    
                    // Update the UI
                    refreshAllianceDisplay();
                    
                    // Update available teams list
                    updateAvailableTeamsList();
                    
                    // Show a toast notification
                    showToast('Alliance selections synced from server', 'info');
                }
            }
        }
    }).fail(function(jqXHR, textStatus) {
        console.error('Error loading alliance selections:', textStatus);
    });
}

// Refresh the display of all alliances based on selectedTeams state
function refreshAllianceDisplay() {
    // Clear all alliance slots first
    $('.team-slot').addClass('empty')
                  .removeClass('filled')
                  .text('Select team')
                  .removeData('team');
                  
    // Re-add all the teams from the state
    for (const key in allianceSelectionState.selectedTeams) {
        if (allianceSelectionState.selectedTeams.hasOwnProperty(key)) {
            const [alliance, position] = key.split('-');
            const teamNumber = allianceSelectionState.selectedTeams[key];
            updateAllianceDisplay(alliance, position, teamNumber);
        }
    }
}

// Start periodic synchronization
function startAllianceSync() {
    if (allianceSelectionState.syncInterval) {
        clearInterval(allianceSelectionState.syncInterval);
    }
    
    // Initial load
    loadAllianceSelections();
    
    // Initialize last sync time display
    updateLastSyncTime();
    
    // Set up interval for periodic syncing (every 10 seconds)
    allianceSelectionState.syncInterval = setInterval(function() {
        loadAllianceSelections();
    }, 10000);
    
    allianceSelectionState.isSyncEnabled = true;
}

// Stop synchronization
function stopAllianceSync() {
    if (allianceSelectionState.syncInterval) {
        clearInterval(allianceSelectionState.syncInterval);
        allianceSelectionState.syncInterval = null;
    }
    
    allianceSelectionState.isSyncEnabled = false;
}

// Toggle synchronization
function toggleAllianceSync() {
    if (allianceSelectionState.isSyncEnabled) {
        stopAllianceSync();
        showToast('Alliance synchronization disabled', 'warning');
        $('#toggle_alliance_sync').removeClass('btn-success').addClass('btn-danger').text('Enable Sync');
    } else {
        startAllianceSync();
        showToast('Alliance synchronization enabled', 'success');
        $('#toggle_alliance_sync').removeClass('btn-danger').addClass('btn-success').text('Disable Sync');
    }
}

// Set up event handlers for alliance selection
function setupAllianceEventHandlers() {
    // Team filtering
    $('#alliance_team_filter').on('input', function() {
        filterAvailableTeams($(this).val());
    });
    
    // Clear filter
    $('#clear_alliance_filter').on('click', function() {
        $('#alliance_team_filter').val('');
        filterAvailableTeams('');
    });
    
    // Team selection
    $(document).on('click', '.available-team-item', function() {
        const teamNumber = $(this).data('team');
        showAllianceSelectionDialog(teamNumber);
    });
    
    // Get recommendations button click handler - Update the existing handler
    $('#recommend_alliance').off('click').on('click', function() {
        const myTeamNumber = $('#my_team_number').val().trim();
        if (myTeamNumber) {
            // Get the recommendation preference (offense/defense/balanced)
            const preference = $('#recommendation_preference').val();
            // Get the robot type preference
            const robotType = $('#robot_type_preference').val();
            console.log(`Getting ${preference} recommendations for team ${myTeamNumber} with ${robotType} preference`);
            
            // Get alliance recommendations based on team data
            getAllianceRecommendations(myTeamNumber, preference, robotType);
        } else {
            showToast('Please enter your team number first', 'warning');
        }
    });
    
    // Reset all selections
    $('#reset_alliance_selection').on('click', function() {
        resetAllianceSelections();
    });
    
    // Handle clicking on alliance slots to add/remove teams
    $(document).on('click', '.team-slot', function() {
        if ($(this).hasClass('empty')) {
            // If slot is empty, show team selection dropdown
            showTeamSelectionDropdown($(this));
        } else {
            // If slot has a team, handle removal
            const teamNumber = $(this).data('team');
            const alliance = $(this).closest('.alliance-card').data('alliance');
            const position = $(this).closest('.alliance-team').data('position');
            
            if (confirm(`Remove Team ${teamNumber} from Alliance ${alliance}?`)) {
                removeTeamFromAlliance(teamNumber, alliance, position);
            }
        }
    });
    
    // Close dropdown when clicking elsewhere
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.team-slot, .team-dropdown').length) {
            $('.team-dropdown').remove();
        }
    });
    
    // Do Not Pick list event handlers
    $('#add_dnp_btn').on('click', function() {
        const teamNumber = $('#add_dnp_input').val().trim();
        
        if (teamNumber && !isNaN(parseInt(teamNumber))) {
            addTeamToDoNotPickList(teamNumber);
            $('#add_dnp_input').val('');
        } else {
            showToast('Please enter a valid team number', 'warning');
        }
    });
    
    // Remove from Do Not Pick list
    $(document).on('click', '.remove-dnp-btn', function() {
        const teamNumber = $(this).data('team');
        removeTeamFromDoNotPickList(teamNumber);
    });
    
    // Export Do Not Pick list
    $('#export_dnp_btn').on('click', function() {
        exportDoNotPickList();
    });
    
    // Import Do Not Pick list
    $('#import_dnp_input').on('change', function(e) {
        if (e.target.files.length > 0) {
            importDoNotPickList(e.target.files[0]);
            // Clear the input so the same file can be selected again
            $(this).val('');
        }
    });
    
    $('#import_dnp_btn').on('click', function() {
        $('#import_dnp_input').click();
    });
    
    // Clear Do Not Pick list
    $('#clear_dnp_btn').on('click', function() {
        if (confirm('Are you sure you want to clear the entire "Do Not Pick" list?')) {
            allianceSelectionState.doNotPickList = [];
            updateDoNotPickList();
            saveDoNotPickList();
            updateAvailableTeamsList();
            showToast('Cleared "Do Not Pick" list', 'success');
        }
    });
    
    // Defense list event handlers
    $('#add_defense_btn').on('click', function() {
        const teamNumber = $('#add_defense_input').val().trim();
        
        if (teamNumber && !isNaN(parseInt(teamNumber))) {
            addTeamToDefenseList(teamNumber);
            $('#add_defense_input').val('');
        } else {
            showToast('Please enter a valid team number', 'warning');
        }
    });
    
    // Remove from Defense list
    $(document).on('click', '.remove-defense-btn', function() {
        const teamNumber = $(this).data('team');
        removeTeamFromDefenseList(teamNumber);
    });
    
    // Export Defense list
    $('#export_defense_btn').on('click', function() {
        exportDefenseList();
    });
    
    // Import Defense list
    $('#import_defense_input').on('change', function(e) {
        if (e.target.files.length > 0) {
            importDefenseList(e.target.files[0]);
            // Clear the input so the same file can be selected again
            $(this).val('');
        }
    });
    
    $('#import_defense_btn').on('click', function() {
        $('#import_defense_input').click();
    });
    
    // Clear Defense list
    $('#clear_defense_btn').on('click', function() {
        if (confirm('Are you sure you want to clear the entire Defense list?')) {
            allianceSelectionState.defenseList = [];
            updateDefenseList();
            saveDefenseList();
            showToast('Cleared Defense list', 'success');
        }
    });
    
    // Wrap the existing defense list management buttons in a nicer container
    if ($('.defense-list-tools').length === 0) {
        $('#defense_container').prepend(`
            <div class="defense-list-tools">
                <div>
                    <div class="input-group">
                        <input type="text" class="form-control" id="add_defense_input" placeholder="Enter team number">
                        <div class="input-group-append">
                            <button class="btn btn-success" id="add_defense_btn">
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-info" id="import_defense_btn">
                        <i class="fas fa-file-import"></i> Import
                    </button>
                    <button class="btn btn-info" id="export_defense_btn">
                        <i class="fas fa-file-export"></i> Export
                    </button>
                    <button class="btn btn-danger" id="clear_defense_btn">
                        <i class="fas fa-trash"></i> Clear
                    </button>
                    <input type="file" id="import_defense_input" style="display: none;">
                </div>
            </div>
        `);
    }
    
    // Add keyboard support for team number entry
    $('#add_defense_input').on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            e.preventDefault();
            const teamNumber = $(this).val().trim();
            if (teamNumber && !isNaN(parseInt(teamNumber))) {
                addTeamToDefenseList(teamNumber);
                $(this).val('');
            } else {
                showToast('Please enter a valid team number', 'warning');
            }
        }
    });
    
    // Avoid list event handlers
    $('#add_avoid_btn').on('click', function() {
        const teamNumber = $('#add_avoid_input').val().trim();
        
        if (teamNumber && !isNaN(parseInt(teamNumber))) {
            addTeamToAvoidList(teamNumber);
            $('#add_avoid_input').val('');
        } else {
            showToast('Please enter a valid team number', 'warning');
        }
    });
    
    // Add keyboard support for team number entry
    $('#add_avoid_input').on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            e.preventDefault();
            const teamNumber = $(this).val().trim();
            if (teamNumber && !isNaN(parseInt(teamNumber))) {
                addTeamToAvoidList(teamNumber);
                $(this).val('');
            } else {
                showToast('Please enter a valid team number', 'warning');
            }
        }
    });
    
    // Remove from Avoid list
    $(document).on('click', '.remove-avoid-btn', function() {
        const teamNumber = $(this).data('team');
        removeTeamFromAvoidList(teamNumber);
    });
    
    // Export Avoid list
    $('#export_avoid_btn').on('click', function() {
        exportAvoidList();
    });
    
    // Import Avoid list
    $('#import_avoid_input').on('change', function(e) {
        if (e.target.files.length > 0) {
            importAvoidList(e.target.files[0]);
            // Clear the input so the same file can be selected again
            $(this).val('');
        }
    });
    
    $('#import_avoid_btn').on('click', function() {
        $('#import_avoid_input').click();
    });
    
    // Clear Avoid list
    $('#clear_avoid_btn').on('click', function() {
        if (confirm('Are you sure you want to clear the entire "Avoid" list?')) {
            allianceSelectionState.avoidList = [];
            updateAvoidList();
            saveAvoidList();
            updateAvailableTeamsList();
            showToast('Cleared "Avoid" list', 'success');
        }
    });
    
    // Add toggle for alliance sync
    if ($('#alliance_sync_controls').length === 0) {
        $('#alliances_container').before(`
            <div id="alliance_sync_controls" class="mb-3">
                <button id="toggle_alliance_sync" class="btn btn-success btn-sm">Disable Sync</button>
                <button id="force_sync" class="btn btn-primary btn-sm ml-2">Force Sync Now</button>
                <span id="last_sync_time" class="text-muted ml-2">Last sync: Never</span>
            </div>
        `);
        
        // Add event handlers for sync controls
        $('#toggle_alliance_sync').on('click', toggleAllianceSync);
        $('#force_sync').on('click', function() {
            loadAllianceSelections();
            saveAllianceSelections();
            $('#last_sync_time').text('Last sync: Just now');
        });
    }
    
    // Start alliance sync when page loads
    startAllianceSync();
}

// Update the available teams list in the UI - Modified to mark avoided and do-not-pick teams
function updateAvailableTeamsList() {
    const $list = $('#available_teams_list');
    
    if (!$list.length) {
        return; // Element doesn't exist yet
    }
    
    $list.empty();
    
    if (allianceSelectionState.availableTeams.length === 0) {
        $list.html('<div class="text-center text-muted">No available teams</div>');
        return;
    }
    
    // Sort teams numerically
    const sortedTeams = [...allianceSelectionState.availableTeams].sort((a, b) => parseInt(a) - parseInt(b));
    
    // Create team items
    let availableCount = 0;
    sortedTeams.forEach(team => {
        // Skip teams that have already been selected
        if (isTeamAlreadySelected(team)) {
            return;
        }
        
        availableCount++;
        
        // Check if team is in the avoid list or do not pick list
        const isAvoided = isTeamInAvoidList(parseInt(team));
        const isDoNotPick = allianceSelectionState.doNotPickList.includes(parseInt(team));
        
        const $teamItem = $(`
            <div class="available-team-item ${isAvoided ? 'avoided-team' : ''} ${isDoNotPick ? 'do-not-pick-team' : ''}" data-team="${team}">
                <span class="team-number">
                    Team ${team} 
                    ${isAvoided ? '<span class="avoid-list-badge">Avoid</span>' : ''}
                    ${isDoNotPick ? '<span class="do-not-pick-badge">Do Not Pick</span>' : ''}
                </span>
                <button class="btn btn-sm btn-outline-light select-team-btn">Select</button>
            </div>
        `);
        
        $list.append($teamItem);
    });
    
    // Update counter
    $('#available_team_count').text(`${availableCount} teams available`);
}

// Filter the available teams list based on search term
function filterAvailableTeams(searchTerm) {
    const term = searchTerm.toLowerCase();
    
    $('.available-team-item').each(function() {
        const teamNumber = $(this).data('team').toString();
        if (teamNumber.includes(term)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
}

// Modify the existing resetAllianceSelections function to save changes to server
function resetAllianceSelections() {
    if (!confirm('Are you sure you want to reset all alliance selections?')) {
        return;
    }
    
    // Clear the state
    allianceSelectionState.selectedTeams = {};
    
    // Clear the UI
    $('.team-slot').addClass('empty')
                  .removeClass('filled')
                  .text('Select team')
                  .removeData('team')
                  .find('.remove-team-btn')
                  .remove();
    
    // Update available teams list
    updateAvailableTeamsList();
    
    // Save the empty selections to the server
    $.ajax({
        url: '/save_alliance_selections',
        type: 'POST',
        data: { 
            'selections': JSON.stringify({})
        },
        success: function(data) {
            if (data.success) {
                console.log('Alliance selections reset on server');
                allianceSelectionState.lastSyncTimestamp = data.timestamp;
                updateLastSyncTime();
                showToast('Alliance selections have been reset for all devices', 'success');
            } else {
                console.error('Error resetting alliance selections on server');
                showToast('Error synchronizing reset to all devices', 'danger');
            }
        },
        error: function(jqXHR, textStatus) {
            console.error('Error saving reset to server:', textStatus);
            showToast('Failed to reset alliance selections on server', 'danger');
        }
    });
}

// Show alliance selection dialog
function showAllianceSelectionDialog(teamNumber) {
    // Create a modal dialog for selecting alliance and position
    const $modal = $(`
        <div class="modal fade" id="allianceSelectionModal" tabindex="-1" role="dialog" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header">
                        <h5 class="modal-title">Select Position for Team ${teamNumber}</h5>
                        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="alliance-select">Select Alliance:</label>
                            <div class="alliance-buttons mb-4">
                                ${allianceSelectionState.allianceColors.map((color, i) => `
                                    <button class="btn btn-${color} alliance-btn mx-1 mb-2" data-alliance="${i+1}">
                                        ${i+1}
                                    </button>
                                `).join('')}
                            </div>
                            <div class="selected-alliance mt-3">
                                <span class="badge badge-secondary p-2">No alliance selected</span>
                            </div>
                        </div>
                        
                        <div class="form-group mt-4">
                            <label>Select Position:</label>
                            <div>
                                <button class="btn btn-outline-light position-btn m-1" data-position="1" disabled>Captain</button>
                                <button class="btn btn-outline-light position-btn m-1" data-position="2" disabled>First Pick</button>
                                <button class="btn btn-outline-light position-btn m-1" data-position="3" disabled>Second Pick</button>
                                <button class="btn btn-outline-light position-btn m-1" disabled>Backup</button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-success" id="confirm-selection" disabled>Confirm Selection</button>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    // Add CSS for the alliance selection modal
    if (!$('#alliance-selection-styles').length) {
        $('head').append(`
            <style id="alliance-selection-styles">
                .alliance-buttons, .position-buttons {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                .alliance-btn {
                    width: 60px;
                    height: 60px;
                    font-size: 20px;
                    font-weight: bold;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    margin: 5px;
                }
                .alliance-btn.active {
                    transform: scale(1.1);
                    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                }
                .position-btn {
                    min-width: 110px;
                    transition: all 0.2s ease;
                }
                .position-btn.active {
                    background-color: #7065a2;
                    color: white;
                    transform: scale(1.05);
                }
                .selected-alliance {
                    text-align: center;
                    font-weight: bold;
                }
                .position-unavailable {
                    position: relative;
                    opacity: 0.5;
                }
                .position-unavailable::after {
                    content: "Already filled";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 12px;
                }
            </style>
        `);
    }
    
    // Variables to track selections
    let selectedAlliance = null;
    let selectedPosition = null;
    
    // Add event handlers
    $modal.find('.alliance-btn').on('click', function() {
        // Remove active class from all alliance buttons
        $modal.find('.alliance-btn').removeClass('active');
        
        // Add active class to this button
        $(this).addClass('active');
        
        // Store the selected alliance
        selectedAlliance = $(this).data('alliance');
        
        // Update the selected alliance display
        $modal.find('.selected-alliance').html(`
            <span class="badge badge-${allianceSelectionState.allianceColors[selectedAlliance-1]} p-2">
                Alliance ${selectedAlliance}
            </span>
        `);
        
        // Enable position buttons
        $modal.find('.position-btn').prop('disabled', false);
        
        // Check which positions are already filled and mark them
        $modal.find('.position-btn').each(function() {
            const position = $(this).data('position');
            const isPositionFilled = allianceSelectionState.selectedTeams[`${selectedAlliance}-${position}`] !== undefined;
            
            if (isPositionFilled) {
                const currentTeam = allianceSelectionState.selectedTeams[`${selectedAlliance}-${position}`];
                $(this).addClass('position-unavailable')
                       .attr('title', `Position filled by Team ${currentTeam}`);
            } else {
                $(this).removeClass('position-unavailable').removeAttr('title');
            }
        });
        
        // Update the confirm button state
        updateConfirmButtonState();
    });
    
    $modal.find('.position-btn').on('click', function() {
        // Don't allow selecting filled positions
        if ($(this).hasClass('position-unavailable')) {
            return;
        }
        
        // Remove active class from all position buttons
        $modal.find('.position-btn').removeClass('active');
        
        // Add active class to this button
        $(this).addClass('active');
        
        // Store the selected position
        selectedPosition = $(this).data('position');
        
        // Update the confirm button state
        updateConfirmButtonState();
    });
    
    // Function to update the confirm button state
    function updateConfirmButtonState() {
        if (selectedAlliance !== null && selectedPosition !== null) {
            $modal.find('#confirm-selection').prop('disabled', false);
        } else {
            $modal.find('#confirm-selection').prop('disabled', true);
        }
    }
    
    // Handle confirm click
    $modal.find('#confirm-selection').on('click', function() {
        // Close the modal
        $modal.modal('hide');
        
        // Check if this position is already filled
        if (isPositionFilled(selectedAlliance, selectedPosition)) {
            const currentTeam = allianceSelectionState.selectedTeams[`${selectedAlliance}-${selectedPosition}`];
            
            // Show a confirmation dialog
            if (confirm(`Replace Team ${currentTeam} with Team ${teamNumber}?`)) {
                // Add the team to the alliance
                addTeamToAlliance(teamNumber, selectedAlliance, selectedPosition);
            }
        } else {
            // Add the team to the alliance
            addTeamToAlliance(teamNumber, selectedAlliance, selectedPosition);
        }
    });
    
    // Show the modal
    $('body').append($modal);
    $modal.modal('show');
    
    // Remove the modal when it's closed
    $modal.on('hidden.bs.modal', function() {
        $(this).remove();
    });
}

// Add a team to an alliance
function addTeamToAlliance(teamNumber, alliance, position) {
    // Check if the position is already filled
    if (isPositionFilled(alliance, position)) {
        // Ask if they want to replace the team
        const currentTeam = allianceSelectionState.selectedTeams[`${alliance}-${position}`];
        if (!confirm(`Replace Team ${currentTeam} with Team ${teamNumber}?`)) {
            return;
        }
        
        // Remove the current team from the alliance
        removeTeamFromAlliance(currentTeam, alliance, position);
    }
    
    // Check if the team is in the Do Not Pick list and warn the user
    if (allianceSelectionState.doNotPickList.includes(parseInt(teamNumber))) {
        if (!confirm(`Team ${teamNumber} is in your "Do Not Pick" list. Are you sure you want to add them to the alliance?`)) {
            return;
        }
    }
    
    // Update the state
    allianceSelectionState.selectedTeams[`${alliance}-${position}`] = teamNumber;
    
    // Update the UI
    updateAllianceDisplay(alliance, position, teamNumber);
    
    // Update available teams list
    updateAvailableTeamsList();
    
    // Show success message
    showToast(`Team ${teamNumber} added to Alliance ${alliance} as ${getPositionName(position)}`, 'success');
    
    // Save the updated selections to the server
    saveAllianceSelections();
}

// Remove a team from an alliance
function removeTeamFromAlliance(teamNumber, alliance, position) {
    // Update the state
    delete allianceSelectionState.selectedTeams[`${alliance}-${position}`];
    
    // Update the UI
    clearAlliancePosition(alliance, position);
    
    // Update available teams list
    updateAvailableTeamsList();
    
    // Show success message
    showToast(`Team ${teamNumber} removed from Alliance ${alliance}`, 'info');
    
    // Save the updated selections to the server
    saveAllianceSelections();
}

// Update the alliance display to show a team
function updateAllianceDisplay(alliance, position, teamNumber) {
    const $slot = $(`.alliance-card[data-alliance="${alliance}"] .alliance-team[data-position="${position}"] .team-slot`);
    
    // Update the slot
    $slot.removeClass('empty')
         .addClass('filled')
         .text(`Team ${teamNumber}`)
         .data('team', teamNumber);
}

// Clear an alliance position
function clearAlliancePosition(alliance, position) {
    const $slot = $(`.alliance-card[data-alliance="${alliance}"] .alliance-team[data-position="${position}"] .team-slot`);
    
    // Clear the slot
    $slot.addClass('empty')
         .removeClass('filled')
         .text('Select team')
         .removeData('team');
}

// Check if a position in an alliance is already filled
function isPositionFilled(alliance, position) {
    return allianceSelectionState.selectedTeams[`${alliance}-${position}`] !== undefined;
}

// Check if a team is already selected in any alliance
function isTeamAlreadySelected(teamNumber) {
    return Object.values(allianceSelectionState.selectedTeams).includes(parseInt(teamNumber));
}

// Get the name of a position based on its number
function getPositionName(position) {
    switch (parseInt(position)) {
        case 1: return 'Captain';
        case 2: return 'First Pick';
        case 3: return 'Second Pick';
        case 4: return 'Backup';
        default: return `Position ${position}`;
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    // Create toast element if it doesn't exist
    if ($('#alliance_toast_container').length === 0) {
        // Change positioning from right to left side of screen
        $('body').append('<div id="alliance_toast_container" class="toast-container" style="position: fixed; bottom: 20px; left: 20px; z-index: 1050;"></div>');
    }
    
    // Generate a unique ID for the toast
    const toastId = 'toast-' + Date.now();
    
    // Create the toast
    const $toast = $(`
        <div id="${toastId}" class="toast bg-${type} text-white">
            <div class="toast-header bg-${type} text-white">
                <strong class="mr-auto">Alliance Selection</strong>
                <button type="button" class="ml-2 mb-1 close text-white" data-dismiss="toast">&times;</button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `);
    
    // Append to container
    $('#alliance_toast_container').append($toast);
    
    // Show the toast
    $toast.toast({ 
        delay: 3000,
        autohide: true
    }).toast('show');
    
    // Remove from DOM when hidden
    $toast.on('hidden.bs.toast', function() {
        $(this).remove();
    });
}

// Show team selection dropdown
function showTeamSelectionDropdown($slot) {
    // Remove any existing dropdowns
    $('.team-dropdown').remove();
    
    const alliance = $slot.closest('.alliance-card').data('alliance');
    const position = $slot.closest('.alliance-team').data('position');
    const allianceColor = allianceSelectionState.allianceColors[alliance-1];
    
    // Get position name
    const positionName = getPositionName(position);
    
    // Get available teams - MODIFIED: Don't filter out "Do Not Pick" list teams for manual selection
    const availableTeams = [...allianceSelectionState.availableTeams]
        .filter(team => !isTeamAlreadySelected(team))
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    if (availableTeams.length === 0) {
        showToast('No available teams to select', 'warning');
        return;
    }
    
    // Create dropdown
    const $dropdown = $(`
        <div class="team-dropdown">
            <div class="team-dropdown-header bg-${allianceColor}">
                <span>Select Team for ${positionName}</span>
                <button type="button" class="close text-white" aria-label="Close">
                    <span>&times;</span>
                </button>
            </div>
            <div class="team-dropdown-body">
                <div class="team-filter-container">
                    <input type="text" class="form-control team-filter-input" placeholder="Filter teams...">
                </div>
                <div class="available-team-dropdown-container">
                    ${availableTeams.map(team => {
                        // Check if team is in Do Not Pick or Avoid lists
                        const isDoNotPick = allianceSelectionState.doNotPickList.includes(parseInt(team));
                        const isAvoided = allianceSelectionState.avoidList.includes(parseInt(team));
                        
                        return `
                            <div class="available-team-dropdown-item ${isDoNotPick ? 'do-not-pick-team' : ''} ${isAvoided ? 'avoided-team' : ''}" 
                                 data-team="${team}">
                                Team ${team}
                                ${isDoNotPick ? '<span class="do-not-pick-badge">Do Not Pick</span>' : ''}
                                ${isAvoided ? '<span class="avoid-list-badge">Avoid</span>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `);
    
    // Position the dropdown relative to the slot
    $slot.append($dropdown);
    
    // Add event handlers
    $dropdown.find('.team-filter-input').on('input', function() {
        const filterTerm = $(this).val().toLowerCase();
        $dropdown.find('.available-team-dropdown-item').each(function() {
            const teamNumber = $(this).data('team').toString();
            if (teamNumber.includes(filterTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    
    $dropdown.find('.available-team-dropdown-item').on('click', function() {
        const teamNumber = $(this).data('team');
        addTeamToAlliance(teamNumber, alliance, position);
        $dropdown.remove();
    });
    
    // Focus the filter input
    $dropdown.find('.team-filter-input').focus();
    
    // Add styles for the dropdown if they don't exist
    if (!$('#team-dropdown-styles').length) {
        $('head').append(`
            <style id="team-dropdown-styles">
                .team-slot {
                    position: relative;
                }
                .team-dropdown {
                    position: absolute;
                    top: calc(100% + 5px);
                    left: 0;
                    width: 100%;
                    max-height: 300px;
                    background-color: #333;
                    border-radius: 5px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                    z-index: 1000;
                    overflow: hidden;
                }
                .team-dropdown-header {
                    padding: 8px 12px;
                    color: white;
                    font-weight: bold;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                }
                .team-dropdown-body {
                    padding: 8px;
                }
                .team-filter-input {
                    width: 100%;
                    padding: 6px 10px;
                    border-radius: 4px;
                    border: 1px solid #666;
                    background-color: #222;
                    color: white;
                    margin-bottom: 8px;
                }
                .available-team-dropdown-container {
                    max-height: 200px;
                    overflow-y: auto;
                }
                .available-team-dropdown-item {
                    padding: 6px 10px;
                    cursor: pointer;
                    border-radius: 3px;
                    transition: all 0.2s ease;
                }
                .available-team-dropdown-item:hover {
                    background-color: rgba(112, 101, 162, 0.5);
                }
                .do-not-pick-team {
                    border-left: 5px solid #dc3545;
                }
                .do-not-pick-badge {
                    background-color: #dc3545;
                    color: white;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-left: 5px;
                }
                .avoided-team {
                    border-left: 5px solid #ffc107;
                }
                .avoid-list-badge {
                    background-color: #ffc107;
                    color: black;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-left: 5px;
                }
            </style>
        `);
    }
}

// Get alliance recommendations
function getAllianceRecommendations(myTeamNumber, preference = 'offense', robotType = 'any') {
    showSpinner();
    
    // Set user's team number in state
    allianceSelectionState.myTeamNumber = myTeamNumber;
    
    // First, load team rankings data
    $.get('/get_team_rankings', function(rankingsData) {
        // Store rankings data
        allianceSelectionState.teamRankings = rankingsData;
        
        // If defense preference is selected, get defensive teams first
        if (preference === 'defense') {
            $.get('/get_defense_teams', function(defenseData) {
                allianceSelectionState.defenseTeamRankings = defenseData;
                
                // Now load team average data
                $.get('/get_all_team_averages', function(data) {
                    allianceSelectionState.teamData = data;
                    
                    // We also need to load match counts for each team
                    $.get('/get_team_match_counts', function(matchCounts) {
                        // Create mapping of team rankings for quick access with match counts
                        const rankingsMap = {};
                        if (allianceSelectionState.teamRankings) {
                            // Convert to array of objects with team number, points, and match count
                            const rankingsArray = Object.keys(allianceSelectionState.teamRankings).map(team => ({
                                team: parseInt(team),
                                points: allianceSelectionState.teamRankings[team],
                                matchCount: matchCounts[team] || 1 // Default to 1 if not found
                            }));
                            
                            // Sort by points (highest first)
                            rankingsArray.sort((a, b) => b.points - a.points);
                            
                            // Create a map with team number -> {rank, points, matchCount}
                            rankingsArray.forEach((item, index) => {
                                rankingsMap[item.team] = {
                                    rank: index + 1,
                                    points: item.points,
                                    matchCount: item.matchCount
                                };
                            });
                            
                            // Store the updated rankings with match counts
                            allianceSelectionState.teamRankingsWithMatchCounts = rankingsMap;
                        }
                        
                        // Calculate recommendations based on team data and rankings
                        const recommendations = calculateRecommendations(myTeamNumber, preference, robotType);
                        
                        // Display recommendations
                        showRecommendationsDialog(recommendations, preference, robotType);
                        
                        hideSpinner();
                    }).fail(function() {
                        // If getting match counts fails, still continue with the process
                        // Calculate recommendations based on team data and rankings without match counts
                        const recommendations = calculateRecommendations(myTeamNumber, preference, robotType);
                        
                        // Display recommendations
                        showRecommendationsDialog(recommendations, preference, robotType);
                        
                        hideSpinner();
                    });
                }).fail(function(jqXHR, textStatus) {
                    hideSpinner();
                    showToast('Failed to load team data for recommendations', 'danger');
                });
            }).fail(function(jqXHR, textStatus) {
                hideSpinner();
                showToast('Failed to load defense team data', 'danger');
            });
        } else {
            // For non-defense preferences, just get regular team data
            $.get('/get_all_team_averages', function(data) {
                allianceSelectionState.teamData = data;
                
                // We also need to load match counts for each team
                $.get('/get_team_match_counts', function(matchCounts) {
                    // Create mapping of team rankings for quick access with match counts
                    const rankingsMap = {};
                    if (allianceSelectionState.teamRankings) {
                        // Add match counts to rankings
                        const rankingsArray = Object.keys(allianceSelectionState.teamRankings).map(team => ({
                            team: parseInt(team),
                            points: allianceSelectionState.teamRankings[team],
                            matchCount: matchCounts[team] || 1 // Default to 1 if not found
                        }));
                        
                        // Sort by points
                        rankingsArray.sort((a, b) => b.points - a.points);
                        
                        // Create map with match counts
                        rankingsArray.forEach((item, index) => {
                            rankingsMap[item.team] = {
                                rank: index + 1,
                                points: item.points,
                                matchCount: item.matchCount
                            };
                        });
                        
                        // Store the updated rankings
                        allianceSelectionState.teamRankingsWithMatchCounts = rankingsMap;
                    }
                    
                    // Calculate recommendations
                    const recommendations = calculateRecommendations(myTeamNumber, preference, robotType);
                    
                    // Display recommendations
                    showRecommendationsDialog(recommendations, preference, robotType);
                    
                    hideSpinner();
                }).fail(function() {
                    // If getting match counts fails, still continue with the process
                    // Calculate recommendations without match counts
                    const recommendations = calculateRecommendations(myTeamNumber, preference, robotType);
                    
                    // Display recommendations
                    showRecommendationsDialog(recommendations, preference, robotType);
                    
                    hideSpinner();
                });
            }).fail(function(jqXHR, textStatus) {
                hideSpinner();
                showToast('Failed to load team data for recommendations', 'danger');
            });
        }
    }).fail(function(jqXHR, textStatus) {
        hideSpinner();
        showToast('Failed to load team rankings for recommendations', 'danger');
    });
}

// Calculate recommendations based on team rankings and complementary capabilities
// Modify to consider avoid list but not completely exclude those teams
function calculateRecommendations(myTeamNumber, preference, robotType = 'any') {
    const myTeam = allianceSelectionState.teamData[myTeamNumber];
    if (!myTeam) {
        showToast(`No data found for Team ${myTeamNumber}`, 'warning');
        return [];
    }
    
    // Get all available teams (not already selected, not in do not pick list, and not my team)
    // Note: We still exclude Do Not Pick list teams from recommendations, but not from manual selection
    const availableTeams = allianceSelectionState.availableTeams.filter(team => 
        !isTeamAlreadySelected(team) && 
        team != myTeamNumber && 
        !allianceSelectionState.doNotPickList.includes(parseInt(team))
    );
    
    // Create mapping of team rankings for quick access
    const rankingsMap = {};
    if (allianceSelectionState.teamRankings) {
        // Convert to array of objects with team number and points
        const rankingsArray = Object.keys(allianceSelectionState.teamRankings).map(team => ({
            team: parseInt(team),
            points: allianceSelectionState.teamRankings[team]
        }));
        
        // Sort by points (highest first)
        rankingsArray.sort((a, b) => b.points - a.points);
        
        // Create a map with team number -> {rank, points}
        rankingsArray.forEach((item, index) => {
            rankingsMap[item.team] = {
                rank: index + 1,
                points: item.points,
                // Get match count from teamRankingsWithMatchCounts if available
                matchCount: (allianceSelectionState.teamRankingsWithMatchCounts && 
                            allianceSelectionState.teamRankingsWithMatchCounts[item.team] && 
                            allianceSelectionState.teamRankingsWithMatchCounts[item.team].matchCount) || 1
            };
        });
    }
    
    // For defense preference, use the special defense rankings if available
    if (preference === 'defense' && allianceSelectionState.defenseTeamRankings) {
        // Adjust rankings to favor teams in the defense rankings
        for (const team in allianceSelectionState.defenseTeamRankings) {
            if (rankingsMap[team]) {
                // Boost the score for defensive teams
                const defenseScore = allianceSelectionState.defenseTeamRankings[team].score || 0;
                rankingsMap[team].points += defenseScore * 50; // Weight defense heavily
            }
        }
    }
    
    // Calculate scores for each team
    const teamScores = availableTeams.map(team => {
        const teamData = allianceSelectionState.teamData[team];
        if (!teamData) return { team, score: 0, details: 'No data available' };
        
        // Get team's ranking info
        const ranking = rankingsMap[team] || { rank: 999, points: 0, matchCount: 1 };
        
        // Detect robot specialization
        const specialization = detectRobotSpecialization(teamData);
        
        // Use ranking points as the base score, modified slightly by preference
        const score = calculateComplementarityScore(myTeam, teamData, preference, ranking);
        
        // Calculate average score per match
        const matchCount = ranking.matchCount || 1;
        const avgScore = ranking.points / matchCount;
        
        // Generate text description
        const details = getComplementarityDetails(myTeam, teamData, preference, ranking);
        
        return {
            team,
            score,
            avgScore,
            matchCount,
            ranking,
            specialization,
            details,
            // Store original ranking points for sorting
            originalPoints: ranking.points || 0
        };
    }).filter(team => team.score > 0);
    
    // First, sort all teams by their original ranking points (highest first)
    teamScores.sort((a, b) => b.originalPoints - a.originalPoints);
    
    // Filter by robot type if specified
    let filteredTeams = teamScores;
    if (robotType !== 'any') {
        // Filter for teams that have the specified robot type as one of their specializations
        const typeFilteredTeams = teamScores.filter(team => 
            Array.isArray(team.specialization) && 
            team.specialization.includes(robotType)
        );
        
        // If we have teams of the specified type, use them
        if (typeFilteredTeams.length > 0) {
            filteredTeams = typeFilteredTeams;
        } else {
            // If no teams match the robot type, fall back to all teams but show a warning
            showToast(`No ${robotType.replace('_', ' ')} robots found. Showing all robots.`, 'warning');
        }
    }
    
    // Prioritize teams from the defense list if preference is defense
    if (preference === 'defense' && allianceSelectionState.defenseList.length > 0) {
        // Split teams into those on defense list and those not
        const defenseListTeams = [];
        const otherTeams = [];
        
        // Process each team in the filteredTeams array
        filteredTeams.forEach(team => {
            // Find if this team is in the defense list
            const defenseItem = allianceSelectionState.defenseList.find(item => item.team === team.team);
            
            if (defenseItem) {
                // Add the defense rank to the team object and apply a significant boost to score
                team.defenseRank = defenseItem.rank;
                
                // Apply a significant score boost based on defense rank - higher ranks get higher boost
                // This ensures defense list teams are prioritized regardless of other factors
                const rankBoost = (allianceSelectionState.defenseList.length - defenseItem.rank + 1) * 500;
                team.score += rankBoost;
                
                defenseListTeams.push(team);
            } else {
                otherTeams.push(team);
            }
        });
        
        // Sort defense list teams strictly by their defense rank (not by score)
        defenseListTeams.sort((a, b) => a.defenseRank - b.defenseRank);
        
        // Sort other teams by score
        otherTeams.sort((a, b) => b.score - a.score);
        
        // Always put defense list teams first, then other teams
        filteredTeams = [...defenseListTeams, ...otherTeams];
    } else if (preference === 'offense') {
        // For offense, sort strictly by team's original ranking points
        filteredTeams.sort((a, b) => b.originalPoints - a.originalPoints);
    } else {
        // For balanced preference, use the complementarity score which includes both factors
        filteredTeams.sort((a, b) => b.score - a.score);
    }
    
    // Now, divide teams into normal teams and avoided teams
    const normalTeams = [];
    const avoidedTeams = [];
    
    filteredTeams.forEach(team => {
        if (allianceSelectionState.avoidList.includes(team.team)) {
            // Mark this team as avoided
            team.avoided = true;
            avoidedTeams.push(team);
        } else {
            normalTeams.push(team);
        }
    });
    
    // For defense preference, maintain the existing order which prioritizes defense list
    // For other preferences, re-sort by score
    if (preference !== 'defense') {
        normalTeams.sort((a, b) => b.score - a.score);
        avoidedTeams.sort((a, b) => b.score - a.score);
    }
    
    // Start with normal teams and add avoided teams at the end if we need more
    let recommendations = [...normalTeams];
    
    // If we don't have enough normal teams, add some avoided teams
    if (recommendations.length < 5) {
        const neededCount = 5 - recommendations.length;
        recommendations = [...recommendations, ...avoidedTeams.slice(0, neededCount)];
    }
    
    // Return top 5 recommendations (or fewer if not available)
    return recommendations.slice(0, 5);
}

// Calculate complementarity score between two teams
function calculateComplementarityScore(myTeam, otherTeam, preference, ranking) {
    // Start with the team's base ranking score
    let score = ranking.points || 0;
    
    // For a proper complementarity calculation, we need data for both teams
    if (!myTeam || !otherTeam) {
        return score;
    }
    
    // Calculate different factors that indicate how well teams complement each other
    let climbFactor = 0;
    let autoFactor = 0;
    let scoringFactor = 0;
    let defenseFactor = 0;
    
    // Climb complementarity - teams with different climbing capabilities complement each other
    // Determine climb levels for both teams
    const myClimb = calculateClimbLevel(myTeam);
    const otherClimb = calculateClimbLevel(otherTeam);
    
    // Award bonus for teams that can do level 2 or 3 climbs if our team can't
    if (myClimb < 2 && otherClimb >= 2) {
        climbFactor += 20;
    }
    
    // Auto routine complementarity - teams with different auto capabilities complement each other
    const myAutoLeave = myTeam['Leave Bonus (T/F)'] && myTeam['Leave Bonus (T/F)'] > 0.5;
    const otherAutoLeave = otherTeam['Leave Bonus (T/F)'] && otherTeam['Leave Bonus (T/F)'] > 0.5;
    
    // If one team is good at auto and the other isn't, they complement each other
    if (myAutoLeave !== otherAutoLeave) {
        autoFactor += 10;
    }
    
    // Scoring complementarity - teams with different scoring capabilities complement each other
    const myAlgaeNet = (myTeam['Algae Net (#)'] || 0) + (myTeam['Auto Algae Net (#)'] || 0);
    const myAlgaeProcessor = (myTeam['Algae Processor (#)'] || 0) + (myTeam['Auto Algae Processor (#)'] || 0);
    const myCoral = (myTeam['Coral L1 (#)'] || 0) + 
                   (myTeam['Coral L2/L3 (#)'] || 0) + 
                   (myTeam['Coral L4 (#)'] || 0) + 
                   (myTeam['Auto Coral L1 (#)'] || 0) + 
                   (myTeam['Auto Coral L2/L3 (#)'] || 0) + 
                   (myTeam['Auto Coral L4 (#)'] || 0);
    
    const otherAlgaeNet = (otherTeam['Algae Net (#)'] || 0) + (otherTeam['Auto Algae Net (#)'] || 0);
    const otherAlgaeProcessor = (otherTeam['Algae Processor (#)'] || 0) + (otherTeam['Auto Algae Processor (#)'] || 0);
    const otherCoral = (otherTeam['Coral L1 (#)'] || 0) + 
                      (otherTeam['Coral L2/L3 (#)'] || 0) + 
                      (otherTeam['Coral L4 (#)'] || 0) + 
                      (otherTeam['Auto Coral L1 (#)'] || 0) + 
                      (otherTeam['Auto Coral L2/L3 (#)'] || 0) + 
                      (otherTeam['Auto Coral L4 (#)'] || 0);
    
    // Calculate specialization percentages
    const myTotal = myAlgaeNet + myAlgaeProcessor + myCoral;
    const otherTotal = otherAlgaeNet + otherAlgaeProcessor + otherCoral;
    
    if (myTotal > 0 && otherTotal > 0) {
        const myAlgaeNetPct = myAlgaeNet / myTotal * 100;
        const myAlgaeProcessorPct = myAlgaeProcessor / myTotal * 100;
        const myCoralPct = myCoral / myTotal * 100;
        
        const otherAlgaeNetPct = otherAlgaeNet / otherTotal * 100;
        const otherAlgaeProcessorPct = otherAlgaeProcessor / otherTotal * 100;
        const otherCoralPct = otherCoral / otherTotal * 100;
        
        // If the other team is strong where our team is weak, they complement well
        if ((myAlgaeNetPct < 25 && otherAlgaeNetPct > 40) ||
            (myAlgaeProcessorPct < 25 && otherAlgaeProcessorPct > 40) ||
            (myCoralPct < 25 && otherCoralPct > 40)) {
            scoringFactor += 25;
        }
    }
    
    // Defense complementarity
    if (otherTeam['Defense Performed'] && otherTeam['Defense Performed'] > 0.6) {
        defenseFactor += 15;  // Bonus for good defense teams
    }
    
    // Get specializations for both teams
    const mySpecializations = detectRobotSpecialization(myTeam);
    const otherSpecializations = detectRobotSpecialization(otherTeam);
    
    // Higher complementarity if teams have different specializations
    const uniqueSpecializations = new Set([...mySpecializations, ...otherSpecializations]);
    // More unique specializations means better complementarity
    if (uniqueSpecializations.size > Math.max(mySpecializations.length, otherSpecializations.length)) {
        scoringFactor += 15 * (uniqueSpecializations.size - Math.max(mySpecializations.length, otherSpecializations.length));
    }
    
    // Adjust the base score based on the preference
    if (preference === 'offense') {
        // For offense, prioritize scoring and climbing
        score += scoringFactor * 1.5;
        score += climbFactor * 1.2;
        score += autoFactor;
        score += defenseFactor * 0.5; // Defense is less important for offensive strategy
    } else if (preference === 'defense') {
        // For defense, prioritize defense and reliability
        score += defenseFactor * 2;
        score += autoFactor * 0.8;
        score += climbFactor * 0.8;
        score += scoringFactor * 0.7;
    } else {
        // For balanced, consider all factors equally
        score += scoringFactor;
        score += climbFactor;
        score += autoFactor;
        score += defenseFactor;
    }
    
    return score;
}

// Helper function to calculate a team's climb level based on their Endgame Barge average
function calculateClimbLevel(teamData) {
    if (!teamData || !teamData['Endgame Barge']) {
        return 0; // No climb capability
    }
    
    const bargeValue = teamData['Endgame Barge'];
    
    if (bargeValue >= 2.5) {
        return 3; // Deep climber
    } else if (bargeValue >= 1.5) {
        return 2; // Shallow climber
    } else if (bargeValue >= 0.5) {
        return 1; // Parked
    } else {
        return 0; // No climb
    }
}

// Function to generate text description of complementarity - Add avoid list info to details
function getComplementarityDetails(myTeam, otherTeam, preference, ranking) {
    let details = "";
    
    // Add defense information at the top if this is a defense team
    const defenseRank = getTeamDefenseRank(parseInt(otherTeam['Team Number'] || 0));
    if (defenseRank > 0) {
        details += `<strong>Defense List Rank #${defenseRank}.</strong> `;
    }
    
    // Indicate if this team is on the avoid list
    if (allianceSelectionState.avoidList.includes(parseInt(otherTeam.team))) {
        details += `<strong>Note: This team is on your "Avoid" list.</strong> `;
    }
    
    // Start with ranking information
    if (ranking && ranking.rank) {
        details += `Ranked #${ranking.rank} overall. `;
    }
    
    // Add average score per match if available
    if (ranking && ranking.points && ranking.matchCount) {
        const avgScore = (ranking.points / ranking.matchCount).toFixed(1);
        details += `Averages ${avgScore} points per match. `;
    }
    
    // If we don't have detailed data for both teams, return basic info
    if (!myTeam || !otherTeam) {
        return details;
    }
    
    // Analyze climb complementarity
    const myClimb = calculateClimbLevel(myTeam);
    const otherClimb = calculateClimbLevel(otherTeam);
    
    if (otherClimb >= 2 && myClimb < 2) {
        details += `Strong climber that complements your team's climbing capabilities. `;
    } else if (otherClimb === myClimb && otherClimb >= 2) {
        details += `Good climber, similar to your team. `;
    }
    
    // Analyze scoring complementarity
    const myAlgaeNet = (myTeam['Algae Net (#)'] || 0) + (myTeam['Auto Algae Net (#)'] || 0);
    const myAlgaeProcessor = (myTeam['Algae Processor (#)'] || 0) + (myTeam['Auto Algae Processor (#)'] || 0);
    const myCoral = (myTeam['Coral L1 (#)'] || 0) + 
                   (myTeam['Coral L2/L3 (#)'] || 0) + 
                   (myTeam['Coral L4 (#)'] || 0);
    
    const otherAlgaeNet = (otherTeam['Algae Net (#)'] || 0) + (otherTeam['Auto Algae Net (#)'] || 0);
    const otherAlgaeProcessor = (otherTeam['Algae Processor (#)'] || 0) + (otherTeam['Auto Algae Processor (#)'] || 0);
    const otherCoral = (otherTeam['Coral L1 (#)'] || 0) + 
                      (otherTeam['Coral L2/L3 (#)'] || 0) + 
                      (otherTeam['Coral L4 (#)'] || 0);
    
    // Determine scoring strengths
    const strengths = [];
    if (otherAlgaeNet > 2.5) strengths.push("algae net");
    if (otherAlgaeProcessor > 2) strengths.push("algae processor");
    if (otherCoral > 3) strengths.push("coral collection");
    
    if (strengths.length > 0) {
        details += `Excels at ${strengths.join(" and ")}. `;
    }
    
    // Mention defense capabilities
    if (otherTeam['Defense Performed'] && otherTeam['Defense Performed'] > 0.6) {
        details += `Plays effective defense. `;
    }
    
    // Mention auto capabilities
    const otherAutoLeave = otherTeam['Leave Bonus (T/F)'] && otherTeam['Leave Bonus (T/F)'] > 0.5;
    if (otherAutoLeave) {
        details += `Consistent auto routine. `;
    }
    
    // Get specializations for the other team
    const specializations = detectRobotSpecialization(otherTeam);
    
    // Add information about specializations
    if (specializations.length > 0 && !specializations.includes('any')) {
        if (specializations.length === 1) {
            details += `${formatSpecialization(specializations[0])} robot. `;
        } else {
            const formattedSpecs = specializations.map(spec => formatSpecialization(spec));
            details += `Multi-role robot: ${formattedSpecs.join(' and ')}. `;
        }
    }
    
    return details;
}

// Function to detect robot specialization based on team data
function detectRobotSpecialization(teamData) {
    // Default to "any" if we can't determine a specialization
    if (!teamData) return ['any'];
    
    // Get the values for each specialization area
    const algaeNet = (teamData['Algae Net (#)'] || 0) + (teamData['Auto Algae Net (#)'] || 0);
    const algaeProcessor = (teamData['Algae Processor (#)'] || 0) + (teamData['Auto Algae Processor (#)'] || 0);
    const coral = (teamData['Coral L1 (#)'] || 0) + 
                 (teamData['Coral L2/L3 (#)'] || 0) + 
                 (teamData['Coral L4 (#)'] || 0) + 
                 (teamData['Auto Coral L1 (#)'] || 0) + 
                 (teamData['Auto Coral L2/L3 (#)'] || 0) + 
                 (teamData['Auto Coral L4 (#)'] || 0);
    
    // Determine thresholds for specialization
    const total = algaeNet + algaeProcessor + coral;
    if (total === 0) return ['any']; // No data available
    
    // Calculate percentages
    const algaeNetPercent = algaeNet / total * 100;
    const algaeProcessorPercent = algaeProcessor / total * 100;
    const coralPercent = coral / total * 100;
    
    // Set specialization thresholds
    // A robot can have multiple specializations if it exceeds these thresholds
    const specializationThreshold = 30; // Lower threshold to allow multiple specializations
    
    // Create an array to store specializations
    let specializations = [];
    
    // Add specializations that exceed the threshold
    if (algaeNetPercent > specializationThreshold) {
        specializations.push('algae_net');
    }
    
    if (algaeProcessorPercent > specializationThreshold) {
        specializations.push('algae_processor');
    }
    
    if (coralPercent > specializationThreshold) {
        specializations.push('coral');
    }
    
    // If no specializations were found, return 'any'
    return specializations.length > 0 ? specializations : ['any'];
}

// Function to format specialization for display
function formatSpecialization(specialization) {
    switch(specialization) {
        case 'algae_net':
            return 'Algae Net';
        case 'algae_processor':
            return 'Algae Processor';
        case 'coral':
            return 'Coral Specialist';
        default:
            return 'Balanced';
    }
}

// Function to generate specialization badges HTML
function generateSpecializationBadges(specializations) {
    if (!specializations || specializations.length === 0 || 
        (specializations.length === 1 && specializations[0] === 'any')) {
        return '<span class="specialization-badge badge badge-secondary">Balanced</span>';
    }
    
    return specializations.map(spec => 
        `<span class="specialization-badge badge badge-${getSpecializationColor(spec)}">${formatSpecialization(spec)}</span>`
    ).join(' ');
}

// Function to get an appropriate color for a specialization badge
function getSpecializationColor(specialization) {
    switch(specialization) {
        case 'algae_net':
            return 'success'; // Green
        case 'algae_processor':
            return 'info'; // Blue
        case 'coral':
            return 'warning'; // Yellow/Orange
        default:
            return 'secondary'; // Gray
    }
}

// Show a dialog with the recommendations
function showRecommendationsDialog(recommendations, preference, robotType = 'any') {
    // Format the robot type for display
    let formattedRobotType = robotType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // First, remove any existing modal with the same ID to prevent conflicts
    $('#recommendationsModal').remove();
    
    // Create a modal dialog for displaying recommendations
    const modalHTML = `
        <div class="modal fade" id="recommendationsModal" tabindex="-1" role="dialog" aria-hidden="true">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header">
                        <h5 class="modal-title">Alliance Recommendations for Team ${allianceSelectionState.myTeamNumber}</h5>
                        <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p class="text-center mb-3">
                            ${preference === 'defense' ? 
                              'Teams are ranked by their defense capability based on scouting data.' : 
                              'Teams are ranked primarily by their performance points per match.'}
                            ${robotType !== 'any' ? ` Filtered to show ${formattedRobotType} robots.` : ''}
                            ${preference === 'defense' && allianceSelectionState.defenseList.length > 0 ?
                              '<br><strong>Teams from your defense list are prioritized.</strong>' : ''}
                        </p>
                        <div class="recommendations-container">
                            ${recommendations.map((rec, index) => {
                                const defenseRank = getTeamDefenseRank(rec.team);
                                const defenseLabel = defenseRank > 0 ? 
                                    `<span class="defense-list-badge">Defense Rank #${defenseRank}</span>` : '';
                                
                                return `
                                <div class="recommendation-item ${index === 0 ? 'top-recommendation' : ''}
                                     ${defenseRank > 0 ? 'defense-list-team' : ''} ${rec.avoided ? 'avoid-list-team' : ''}">
                                    <div class="recommendation-header">
                                        <span class="recommendation-rank">${index + 1}</span>
                                        <span class="recommendation-team">Team ${rec.team} ${rec.avoided ? '<span class="avoid-list-badge">Avoid</span>' : ''}</span>
                                        <div class="recommendation-score-container">
                                            ${defenseLabel}
                                            <span class="recommendation-score">${rec.avgScore ? rec.avgScore.toFixed(1) : (rec.score / rec.matchCount).toFixed(1)} pts/match</span>
                                            ${rec.ranking && rec.ranking.rank <= 999 ? 
                                            `<span class="recommendation-rank-badge">Rank #${rec.ranking.rank}</span>` : ''}
                                            <div class="specialization-badges">
                                                ${generateSpecializationBadges(rec.specialization)}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="recommendation-details">
                                        <p>${rec.details}</p>
                                    </div>
                                    <div class="recommendation-actions">
                                        <button class="btn btn-sm btn-outline-primary view-team-data-btn" data-team="${rec.team}">View Details</button>
                                        <button class="btn btn-sm btn-outline-success select-recommendation-btn" data-team="${rec.team}">Select Team</button>
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add styles for the recommendations separately
    if (!$('#recommendation-styles').length) {
        $('head').append(`
            <style id="recommendation-styles">
                .recommendations-container {
                    max-height: 60vh;
                    overflow-y: auto;
                }
                .recommendation-item {
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                    transition: all 0.2s ease;
                }
                .recommendation-item:hover {
                    background-color: rgba(255, 255, 255, 0.15);
                }
                .top-recommendation {
                    background-color: rgba(112, 101, 162, 0.3);
                    border: 1px solid rgba(112, 101, 162, 0.5);
                }
                .top-recommendation:hover {
                    background-color: rgba(112, 101, 162, 0.4);
                }
                .recommendation-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .recommendation-rank {
                    width: 30px;
                    height: 30px;
                    background-color: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    margin-right: 10px;
                }
                .recommendation-team {
                    font-size: 18px;
                    font-weight: bold;
                    margin-right: 15px;
                }
                .recommendation-score-container {
                    margin-left: auto;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }
                .recommendation-score {
                    font-weight: bold;
                    font-size: 18px;
                    color: #6ed6a0;
                }
                .recommendation-rank-badge {
                    font-size: 12px;
                    padding: 2px 6px;
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    margin-top: 4px;
                }
                .recommendation-details {
                    margin-bottom: 15px;
                }
                .recommendation-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .specialization-badges {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    margin-top: 5px;
                }
                .specialization-badge {
                    font-size: 11px;
                    padding: 2px 6px;
                    display: inline-block;
                }
                .defense-list-team {
                    border-left: 5px solid #007bff !important;
                    background-color: rgba(0, 123, 255, 0.15) !important;
                }
                .defense-list-badge {
                    background-color: #007bff;
                    color: white;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-bottom: 4px;
                    display: inline-block;
                }
                .avoid-list-team {
                    border-left: 5px solid #dc3545 !important;
                    background-color: rgba(220, 53, 69, 0.15) !important;
                }
                .avoid-list-badge {
                    background-color: #dc3545;
                    color: white;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-bottom: 4px;
                    display: inline-block;
                }
            </style>
        `);
    }
    
    // Add the modal to the page
    $('body').append(modalHTML);
    
    // Now that the modal is in the DOM, get a reference to it and add event handlers
    const $modal = $('#recommendationsModal');
    
    // Add event handler for selecting a recommendation
    $modal.find('.select-recommendation-btn').on('click', function() {
        const teamNumber = $(this).data('team');
        
        // Close the modal
        $modal.modal('hide');
        
        // Show the alliance selection dialog
        showAllianceSelectionDialog(teamNumber);
    });
    
    // Add event handler for viewing team details
    $modal.find('.view-team-data-btn').on('click', function() {
        const teamNumber = $(this).data('team');
        
        // Show team details in a modal instead of navigating to averages tab
        showTeamDetailsModal(teamNumber);
    });
    
    // Initialize and show the modal
    $modal.modal('show');
    
    // Remove the modal from the DOM when it's closed
    $modal.on('hidden.bs.modal', function() {
        $(this).remove();
    });
}

// Function to show team details in a modal
function showTeamDetailsModal(teamNumber) {
    // Show a loading spinner or message
    showSpinner();
    
    // Fetch team data
    $.post('/get_team_averages', { team_number: teamNumber })
        .done(function(data) {
            hideSpinner();
            
            if (data.error) {
                showToast(data.error, 'warning');
                return;
            }
            
            // Create the modal HTML
            const modalHTML = `
                <div class="modal fade team-details-modal" tabindex="-1" role="dialog" aria-hidden="true">
                    <div class="modal-dialog modal-lg" role="document">
                        <div class="modal-content bg-dark text-white">
                            <div class="modal-header">
                                <h5 class="modal-title">Team ${teamNumber} Details</h5>
                                <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
                                    <span>&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="card bg-dark border-primary mb-3">
                                            <div class="card-header bg-primary">Auto Performance</div>
                                            <div class="card-body">
                                                ${generateMetricsHTML(data.averages, ['Leave Bonus (T/F)', 'Auto Coral L1 (#)', 'Auto Coral L2/L3 (#)', 'Auto Coral L4 (#)', 'Auto Algae Net (#)', 'Auto Algae Processor (#)'])}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card bg-dark border-success mb-3">
                                            <div class="card-header bg-success">Teleop Performance</div>
                                            <div class="card-body">
                                                ${generateMetricsHTML(data.averages, ['Coral L1 (#)', 'Coral L2/L3 (#)', 'Coral L4 (#)', 'Algae Net (#)', 'Algae Processor (#)', 'Endgame Barge'])}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="card bg-dark border-warning">
                                    <div class="card-header bg-warning text-dark">Other Metrics</div>
                                    <div class="card-body">
                                        ${generateMetricsHTML(data.averages, ['Defense Performed', 'Minor Fouls', 'Major Fouls', 'Tipped (T/F)', 'Broke (T/F)'])}
                                    </div>
                                </div>
                                <div class="specialization-display"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-primary" onclick="selectTeamForAlliance(${teamNumber})">Select for Alliance</button>
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove any existing modals with the same class
            $('.team-details-modal').remove();
            
            // Add the modal to the page
            $('body').append(modalHTML);
            
            // Show the modal
            $('.team-details-modal').modal('show');
            
            // Add specialization badges to the team details modal
            const specializations = detectRobotSpecialization(data.averages);
            const specBadges = generateSpecializationBadges(specializations);
            
            $('.team-details-modal .specialization-display').html(`
                <div class="mt-2">
                    <strong>Robot Specialization:</strong>
                    <div class="mt-1">${specBadges}</div>
                </div>
            `);
        })
        .fail(function() {
            hideSpinner();
            showToast('Failed to load team data', 'danger');
        });
}

// Helper to generate metrics HTML for the team details modal
function generateMetricsHTML(data, metrics) {
    let html = '<table class="table table-sm table-dark">';
    html += '<tbody>';
    
    metrics.forEach(metric => {
        if (data && data[metric] !== undefined) {
            let value = data[metric];
            let displayValue = value;
            
            // Format based on metric type
            if (metric === 'Leave Bonus (T/F)' || metric === 'Tipped (T/F)' || metric === 'Broke (T/F)') {
                // Format boolean values
                displayValue = value > 0.5 ? 'Yes' : 'No';
                // Add percentage for clarity
                displayValue += ` (${(value * 100).toFixed(0)}%)`;
            } else if (metric === 'Endgame Barge') {
                // Format climber level
                const level = Math.round(value);
                let climbText = 'None';
                if (level === 1) climbText = 'Parked';
                else if (level === 2) climbText = 'Shallow Climb';
                else if (level === 3) climbText = 'Deep Climb';
                displayValue = `${climbText} (${value.toFixed(2)})`;
            } else if (metric === 'Defense Performed') {
                // Format as percentage
                displayValue = `${(value * 100).toFixed(0)}%`;
            } else {
                // Format numeric values with 2 decimal places
                displayValue = value.toFixed(2);
            }
            
            // Create a nice display name by removing (#) and (T/F)
            const displayName = metric.replace(/\(T\/F\)|\(#\)/g, '').trim();
            
            html += `<tr>
                <td>${displayName}</td>
                <td class="text-right">${displayValue}</td>
            </tr>`;
        }
    });
    
    html += '</tbody></table>';
    
    // If no metrics were found, show a message
    if (html === '<table class="table table-sm table-dark"><tbody></tbody></table>') {
        html = '<p class="text-muted">No data available for these metrics.</p>';
    }
    
    return html;
}

// Helper function to select a team for alliance when clicked from the details modal
function selectTeamForAlliance(teamNumber) {
    // Close the modal
    $('.team-details-modal').modal('hide');
    
    // Show the alliance selection dialog
    showAllianceSelectionDialog(teamNumber);
}

// Add the missing updateLastSyncTime function
function updateLastSyncTime() {
    if (allianceSelectionState.lastSyncTimestamp > 0) {
        const date = new Date(allianceSelectionState.lastSyncTimestamp * 1000);
        $('#last_sync_time').text(`Last sync: ${date.toLocaleTimeString()}`);
    }
}
