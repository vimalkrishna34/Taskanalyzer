let tasks = [];
let nextId = 1;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFromLocalStorage();
    renderCurrentTasks();
    
    // Set default due date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dueDate').value = today;
});

// Form submission handler
document.getElementById('taskForm').addEventListener('submit', function(e) {
    e.preventDefault();
    addTaskFromForm();
});

function addTaskFromForm() {
    const title = document.getElementById('title').value.trim();
    const dueDate = document.getElementById('dueDate').value;
    const estimatedHours = parseInt(document.getElementById('estimatedHours').value);
    const importance = parseInt(document.getElementById('importance').value);
    const dependenciesInput = document.getElementById('dependencies').value.trim();
    
    let dependencies = [];
    if (dependenciesInput) {
        dependencies = dependenciesInput
            .split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id) && id > 0);
    }

    // Validation
    if (!title) {
        showError('Please enter a task title');
        return;
    }

    if (isNaN(estimatedHours) || estimatedHours < 1) {
        showError('Estimated hours must be at least 1');
        return;
    }

    if (isNaN(importance) || importance < 1 || importance > 10) {
        showError('Importance must be between 1 and 10');
        return;
    }

    if (!dueDate) {
        showError('Please select a due date');
        return;
    }

    const task = {
        id: nextId++,
        title: title,
        due_date: dueDate,
        estimated_hours: estimatedHours,
        importance: importance,
        dependencies: dependencies
    };

    tasks.push(task);
    saveToLocalStorage();
    renderCurrentTasks();
    clearForm();
    hideError();
    showMessage(`Task "${title}" added successfully!`);
}

function clearForm() {
    document.getElementById('taskForm').reset();
    // Set default due date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dueDate').value = today;
}

function loadBulkTasks() {
    const bulkInput = document.getElementById('bulkInput').value.trim();
    
    if (!bulkInput) {
        showError('Please enter JSON data');
        return;
    }

    try {
        const newTasks = JSON.parse(bulkInput);
        if (!Array.isArray(newTasks)) {
            throw new Error('Input must be a JSON array');
        }

        let loadedCount = 0;
        let errors = [];
        
        newTasks.forEach((task, index) => {
            // Validate required fields
            if (task.title && task.due_date && task.estimated_hours && task.importance) {
                task.id = nextId++;
                
                // Ensure dependencies is an array
                if (!Array.isArray(task.dependencies)) {
                    task.dependencies = [];
                }
                
                tasks.push(task);
                loadedCount++;
            } else {
                errors.push(`Task ${index + 1} missing required fields`);
            }
        });

        saveToLocalStorage();
        renderCurrentTasks();
        document.getElementById('bulkInput').value = '';
        hideError();
        
        let message = `Successfully loaded ${loadedCount} tasks`;
        if (errors.length > 0) {
            message += `. ${errors.length} tasks had errors.`;
        }
        showMessage(message);
        
    } catch (error) {
        showError('Invalid JSON format: ' + error.message);
    }
}

function analyzeTasks() {
    if (tasks.length === 0) {
        showError('Please add some tasks first');
        return;
    }

    const strategy = document.getElementById('strategy').value;
    showLoading(true);
    hideError();
    hideSuggestions();

    // API endpoint
    const apiUrl = 'http://127.0.0.1:8000/api/tasks/analyze/';
    
    console.log('Sending tasks to analyze:', tasks);
    
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tasks: tasks,
            strategy: strategy
        })
    })
    .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Analysis response:', data);
        if (data.tasks) {
            // Update tasks with scores from backend
            const updatedTasks = data.tasks.map(scoredTask => {
                // Find the original task to preserve ID
                const originalTask = tasks.find(t => t.id === scoredTask.id);
                return { ...originalTask, ...scoredTask };
            });
            tasks = updatedTasks;
            saveToLocalStorage();
            renderTaskList();
            showMessage(`Successfully analyzed ${tasks.length} tasks!`);
        } else if (data.error) {
            throw new Error(data.error);
        } else {
            throw new Error('Invalid response from server');
        }
    })
    .catch(error => {
        console.error('Error analyzing tasks:', error);
        showError('Failed to analyze tasks: ' + error.message);
        // Fallback: Use client-side sorting
        console.log('Using client-side sorting as fallback');
        sortTasksClientSide(strategy);
    })
    .finally(() => {
        showLoading(false);
    });
}

function sortTasksClientSide(strategy) {
    let sortedTasks = [...tasks];
    
    switch(strategy) {
        case 'fastest':
            sortedTasks.sort((a, b) => a.estimated_hours - b.estimated_hours);
            break;
        case 'impact':
            sortedTasks.sort((a, b) => b.importance - a.importance);
            break;
        case 'deadline':
            sortedTasks.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
            break;
        case 'smart':
        default:
            // Simple smart scoring for fallback
            sortedTasks.sort((a, b) => {
                const scoreA = (a.importance * 0.4) + (calculateUrgency(a) * 0.3) + (calculateEffortScore(a) * 0.3);
                const scoreB = (b.importance * 0.4) + (calculateUrgency(b) * 0.3) + (calculateEffortScore(b) * 0.3);
                return scoreB - scoreA;
            });
            break;
    }
    
    // Add fallback scores for display
    sortedTasks = sortedTasks.map(task => ({
        ...task,
        priority_score: task.priority_score || calculateFallbackScore(task, strategy),
        priority_explanation: task.priority_explanation || generateFallbackExplanation(task, strategy)
    }));
    
    tasks = sortedTasks;
    saveToLocalStorage();
    renderTaskList();
    showMessage('Used client-side analysis (backend unavailable)');
}

function calculateUrgency(task) {
    const dueDate = new Date(task.due_date);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) return 1.0;
    if (daysUntilDue === 0) return 0.9;
    if (daysUntilDue <= 2) return 0.8;
    if (daysUntilDue <= 7) return 0.6;
    return 0.3;
}

function calculateEffortScore(task) {
    const hours = task.estimated_hours;
    if (hours <= 1) return 1.0;
    if (hours <= 2) return 0.8;
    if (hours <= 4) return 0.6;
    if (hours <= 8) return 0.4;
    return 0.2;
}

function calculateFallbackScore(task, strategy) {
    switch(strategy) {
        case 'fastest':
            return Math.max(100 - task.estimated_hours * 10, 0);
        case 'impact':
            return task.importance * 10;
        case 'deadline':
            return calculateUrgency(task) * 100;
        default:
            return (task.importance * 4) + (calculateUrgency(task) * 30) + (calculateEffortScore(task) * 20);
    }
}

function generateFallbackExplanation(task, strategy) {
    const explanations = [];
    
    if (strategy === 'fastest') {
        explanations.push(`quick task (${task.estimated_hours}h)`);
    } else if (strategy === 'impact') {
        explanations.push(`importance ${task.importance}/10`);
    } else if (strategy === 'deadline') {
        const dueDate = new Date(task.due_date);
        const today = new Date();
        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilDue < 0) explanations.push('overdue');
        else explanations.push(`due in ${daysUntilDue} days`);
    } else {
        if (task.importance >= 8) explanations.push('high importance');
        if (task.estimated_hours <= 2) explanations.push('quick win');
        if (task.dependencies && task.dependencies.length > 0) explanations.push('has dependencies');
    }
    
    const strategyName = {
        'fastest': 'Fastest Wins',
        'impact': 'High Impact',
        'deadline': 'Deadline Driven',
        'smart': 'Smart Balance'
    }[strategy] || 'Smart Balance';
    
    return `${strategyName} - Client-side analysis: ${explanations.join(', ')}`;
}

function getSuggestions() {
    showLoading(true);
    hideError();

    const apiUrl = 'http://127.0.0.1:8000/api/tasks/suggest/';
    
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Suggestions response:', data);
            if (data.suggestions) {
                displaySuggestions(data.suggestions);
            } else {
                throw new Error('No suggestions in response');
            }
        })
        
        .finally(() => {
            showLoading(false);
        });
}

function displaySuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('suggestions');
    
    suggestionsList.innerHTML = '';
    
    if (suggestions && suggestions.length > 0) {
        suggestions.forEach((suggestion, index) => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <strong>${index + 1}. ${suggestion.task}</strong>
                <p>${suggestion.reason}</p>
            `;
            suggestionsList.appendChild(div);
        });
        suggestionsDiv.classList.remove('hidden');
    } else {
        suggestionsDiv.classList.add('hidden');
    }
}

function renderCurrentTasks() {
    const currentTasksList = document.getElementById('currentTasksList');
    
    if (tasks.length === 0) {
        currentTasksList.innerHTML = '<p class="no-tasks">No tasks added yet. Use the form above to add tasks.</p>';
        return;
    }

    currentTasksList.innerHTML = tasks.map(task => `
        <div class="current-task-item">
            <span class="task-title">${task.title}</span>
            <span class="task-details">
                Due: ${formatDate(task.due_date)} | 
                ${task.estimated_hours}h | 
                Importance: ${task.importance}/10
                ${task.dependencies && task.dependencies.length > 0 ? `| Depends on: ${task.dependencies.join(', ')}` : ''}
            </span>
        </div>
    `).join('');
}

function renderTaskList() {
    const taskList = document.getElementById('taskList');
    
    if (tasks.length === 0) {
        taskList.innerHTML = '<p class="no-tasks">No tasks analyzed yet. Add tasks and click "Analyze & Prioritize Tasks".</p>';
        return;
    }

    taskList.innerHTML = tasks.map(task => {
        const priorityClass = getPriorityClass(task.priority_score);
        const priorityLabel = getPriorityLabel(task.priority_score);
        
        return `
            <div class="task-item ${priorityClass}">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <div class="priority-badge priority-${priorityLabel.toLowerCase()}">
                        ${priorityLabel} Priority
                    </div>
                </div>
                <div class="task-details">
                    <div><strong>Due:</strong> ${formatDate(task.due_date)}</div>
                    <div><strong>Effort:</strong> ${task.estimated_hours}h</div>
                    <div><strong>Importance:</strong> ${task.importance}/10</div>
                    <div><strong>Score:</strong> ${task.priority_score || 'N/A'}</div>
                </div>
                ${task.dependencies && task.dependencies.length > 0 ? 
                    `<div><strong>Dependencies:</strong> ${task.dependencies.join(', ')}</div>` : ''}
                ${task.priority_explanation ? 
                    `<div class="task-explanation">${task.priority_explanation}</div>` : ''}
            </div>
        `;
    }).join('');
}

function getPriorityClass(score) {
    if (score >= 70) return 'high-priority';
    if (score >= 40) return 'medium-priority';
    return 'low-priority';
}

function getPriorityLabel(score) {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function clearTasks() {
    if (tasks.length === 0) {
        showMessage('No tasks to clear');
        return;
    }
    
    if (confirm('Are you sure you want to clear all tasks?')) {
        tasks = [];
        nextId = 1;
        saveToLocalStorage();
        renderCurrentTasks();
        renderTaskList();
        document.getElementById('suggestions').classList.add('hidden');
        showMessage('All tasks cleared successfully!');
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    const errorDiv = document.getElementById('error');
    errorDiv.classList.add('hidden');
}

function showMessage(message) {
    // Create a temporary message display
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        font-weight: 600;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        document.body.removeChild(messageDiv);
    }, 3000);
}

function hideSuggestions() {
    const suggestionsDiv = document.getElementById('suggestions');
    suggestionsDiv.classList.add('hidden');
}

function saveToLocalStorage() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('nextId', nextId.toString());
}

function loadFromLocalStorage() {
    const savedTasks = localStorage.getItem('tasks');
    const savedNextId = localStorage.getItem('nextId');
    
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
    }
    
    if (savedNextId) {
        nextId = parseInt(savedNextId);
    }
}