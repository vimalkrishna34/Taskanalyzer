from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
from datetime import datetime

@csrf_exempt
def analyze_tasks(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            tasks = data.get('tasks', [])
            strategy = data.get('strategy', 'smart')
            
            print(f"Received {len(tasks)} tasks for analysis with strategy: {strategy}")
            
            # Validate tasks
            validated_tasks = []
            for task in tasks:
                if validate_task(task):
                    validated_tasks.append(task)
            
            print(f"Validated {len(validated_tasks)} tasks")
            
            # Calculate scores for each task
            scored_tasks = []
            for task in validated_tasks:
                score = calculate_priority_score(task, validated_tasks, strategy)
                task['priority_score'] = score
                task['priority_explanation'] = generate_explanation(task, score, strategy)
                scored_tasks.append(task)
            
            # Sort based on strategy
            if strategy == 'fastest':
                sorted_tasks = sorted(scored_tasks, key=lambda x: x['estimated_hours'])
            elif strategy == 'impact':
                sorted_tasks = sorted(scored_tasks, key=lambda x: x['importance'], reverse=True)
            elif strategy == 'deadline':
                sorted_tasks = sorted(scored_tasks, key=lambda x: x['due_date'])
            else:  # smart balance
                sorted_tasks = sorted(scored_tasks, key=lambda x: x['priority_score'], reverse=True)
            
            print(f"Returning {len(sorted_tasks)} sorted tasks")
            return JsonResponse({'tasks': sorted_tasks})
            
        except Exception as e:
            print(f"Error in analyze_tasks: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)
@csrf_exempt
def suggest_tasks(request):
    if request.method == 'GET':
        try:
            return JsonResponse({
                'suggestions': [
                    {
                        'task': 'Start with highest priority task',
                        'reason': 'Focus on tasks with high importance and urgency scores first'
                    },
                    {
                        'task': 'Complete quick wins', 
                        'reason': 'Knock out low-effort tasks to build momentum'
                    },
                    {
                        'task': 'Address deadline-sensitive tasks',
                        'reason': 'Prevent tasks from becoming overdue'
                    }
                ]
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

def validate_task(task):
    """Validate task data"""
    required_fields = ['title', 'due_date', 'estimated_hours', 'importance']
    if not all(field in task for field in required_fields):
        return False
    
    # Basic validation
    if task['importance'] < 1 or task['importance'] > 10:
        return False
    if task['estimated_hours'] <= 0:
        return False
    
    return True

def calculate_priority_score(task, all_tasks, strategy='smart'):
    """Calculate priority score based on multiple factors"""
    
    if strategy == 'fastest':
        # Invert hours so lower hours = higher score
        return max(100 - task['estimated_hours'] * 10, 0)
    
    elif strategy == 'impact':
        return task['importance'] * 10
    
    elif strategy == 'deadline':
        return calculate_urgency_score(task) * 100
    
    else:  # smart balance
        base_score = 0
        
        # Importance factor (40% weight)
        importance_score = (task['importance'] / 10) * 40
        
        # Urgency factor (30% weight)
        urgency_score = calculate_urgency_score(task) * 30
        
        # Effort factor (20% weight) - lower effort = higher score
        effort_score = calculate_effort_score(task) * 20
        
        # Dependency factor (10% weight)
        dependency_score = calculate_dependency_score(task, all_tasks) * 10
        
        base_score = importance_score + urgency_score + effort_score + dependency_score
        
        return round(base_score, 2)

def calculate_urgency_score(task):
    """Calculate urgency based on due date"""
    due_date = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
    today = timezone.now().date()
    days_until_due = (due_date - today).days
    
    if days_until_due < 0:
        return 1.0  # Past due - highest urgency
    elif days_until_due == 0:
        return 0.9  # Due today
    elif days_until_due <= 2:
        return 0.8  # Due in 2 days
    elif days_until_due <= 7:
        return 0.6  # Due in a week
    elif days_until_due <= 14:
        return 0.4  # Due in two weeks
    else:
        return 0.2  # More than two weeks

def calculate_effort_score(task):
    """Calculate score based on effort - lower effort = higher score"""
    estimated_hours = task['estimated_hours']
    
    if estimated_hours <= 1:
        return 1.0  # Very quick task
    elif estimated_hours <= 2:
        return 0.8  # Quick task
    elif estimated_hours <= 4:
        return 0.6  # Medium task
    elif estimated_hours <= 8:
        return 0.4  # Long task
    else:
        return 0.2  # Very long task

def calculate_dependency_score(task, all_tasks):
    """Calculate score based on dependencies"""
    if not task.get('dependencies'):
        return 0.5  # No dependencies - neutral score
    
    # Check if this task blocks others
    blocking_count = 0
    task_id = task.get('id')
    for other_task in all_tasks:
        if task_id in other_task.get('dependencies', []):
            blocking_count += 1
    
    if blocking_count > 0:
        return 0.9  # Blocks other tasks - higher priority
    else:
        return 0.3  # Has dependencies but doesn't block others

def generate_explanation(task, score, strategy):
    """Generate explanation for the priority score"""
    explanations = []
    
    if strategy == 'fastest':
        explanations.append(f"quick task ({task['estimated_hours']}h)")
    elif strategy == 'impact':
        explanations.append(f"high importance ({task['importance']}/10)")
    elif strategy == 'deadline':
        due_date = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
        today = timezone.now().date()
        days_until_due = (due_date - today).days
        if days_until_due < 0:
            explanations.append("overdue")
        else:
            explanations.append(f"due in {days_until_due} days")
    else:  # smart balance
        if task['importance'] >= 8:
            explanations.append("high importance")
        
        due_date = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
        today = timezone.now().date()
        days_until_due = (due_date - today).days
        
        if days_until_due < 0:
            explanations.append("overdue")
        elif days_until_due <= 2:
            explanations.append("urgent")
        
        if task['estimated_hours'] <= 2:
            explanations.append("quick win")
        
        if task.get('dependencies'):
            explanations.append("has dependencies")
    
    strategy_name = {
        'fastest': 'Fastest Wins',
        'impact': 'High Impact', 
        'deadline': 'Deadline Driven',
        'smart': 'Smart Balance'
    }.get(strategy, 'Smart Balance')
    
    return f"{strategy_name} - Score {score}: " + ", ".join(explanations)