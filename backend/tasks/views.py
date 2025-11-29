from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
from datetime import datetime


@csrf_exempt
def analyze_tasks(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        tasks = data.get('tasks', [])
        strategy = data.get('strategy', 'smart')

        validated_tasks = []

        # Convert date formats FIRST before validation/scoring
        for task in tasks:
            if validate_task(task):
                # Convert date string to date object only once
                task['due_date_obj'] = datetime.strptime(
                    task['due_date'], '%Y-%m-%d'
                ).date()
                validated_tasks.append(task)

        scored_tasks = []
        for task in validated_tasks:
            score = calculate_priority_score(task, validated_tasks, strategy)
            task['priority_score'] = score
            task['priority_explanation'] = generate_explanation(task, score, strategy)
            scored_tasks.append(task)

        # Sorting by strategy
        if strategy == 'fastest':
            sorted_tasks = sorted(scored_tasks, key=lambda x: x['estimated_hours'])
        elif strategy == 'impact':
            sorted_tasks = sorted(scored_tasks, key=lambda x: x['importance'], reverse=True)
        elif strategy == 'deadline':
            sorted_tasks = sorted(scored_tasks, key=lambda x: x['due_date_obj'])
        else:  # smart
            sorted_tasks = sorted(scored_tasks, key=lambda x: x['priority_score'], reverse=True)

        # Remove date_obj from response to frontend
        for task in sorted_tasks:
            task.pop('due_date_obj', None)

        return JsonResponse({'tasks': sorted_tasks}, status=200)

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def suggest_tasks(request):
    if request.method == 'GET':
        return JsonResponse({
            'suggestions': [
                {'task': 'Start highest score task', 'reason': 'High impact + urgency'},
                {'task': 'Complete quick wins', 'reason': 'Low effort boosts progress'},
                {'task': 'Check deadlines', 'reason': 'Prevent overdue tasks'}
            ]
        })
    return JsonResponse({'error': 'Method not allowed'}, status=405)


# ---------------- SUPPORT FUNCTIONS ---------------- #

def validate_task(task):
    required_fields = ['title', 'due_date', 'estimated_hours', 'importance']
    if not all(field in task for field in required_fields):
        return False
    if not (1 <= task['importance'] <= 10):
        return False
    if task['estimated_hours'] <= 0:
        return False
    return True


def calculate_priority_score(task, all_tasks, strategy):
    if strategy == 'fastest':
        return max(100 - (task['estimated_hours'] * 10), 0)

    if strategy == 'impact':
        return task['importance'] * 10

    if strategy == 'deadline':
        return calculate_urgency_score(task) * 100

    # SMART BALANCE Default
    importance = (task['importance'] / 10) * 40
    urgency = calculate_urgency_score(task) * 30
    effort = calculate_effort_score(task) * 20
    dependency = calculate_dependency_score(task, all_tasks) * 10

    return round(importance + urgency + effort + dependency, 2)


def calculate_urgency_score(task):
    today = timezone.now().date()
    days_left = (task['due_date_obj'] - today).days

    if days_left < 0:
        return 1.0
    elif days_left == 0:
        return 0.9
    elif days_left <= 2:
        return 0.8
    elif days_left <= 7:
        return 0.6
    elif days_left <= 14:
        return 0.4
    return 0.2


def calculate_effort_score(task):
    hours = task['estimated_hours']
    if hours <= 1:
        return 1.0
    if hours <= 2:
        return 0.8
    if hours <= 4:
        return 0.6
    if hours <= 8:
        return 0.4
    return 0.2


def calculate_dependency_score(task, all_tasks):
    if not task.get('dependencies'):
        return 0.5

    task_id = task.get('id')
    blocks_count = sum(task_id in t.get('dependencies', []) for t in all_tasks)

    return 0.9 if blocks_count > 0 else 0.3


def generate_explanation(task, score, strategy):
    today = timezone.now().date()
    days_left = (task['due_date_obj'] - today).days

    details = []
    if strategy == 'fastest':
        details.append(f"quick ({task['estimated_hours']}h)")
    elif strategy == 'impact':
        details.append(f"importance {task['importance']}/10")
    elif strategy == 'deadline':
        details.append(f"due in {days_left} days")
    else:
        if task['importance'] >= 7:
            details.append("important")
        if days_left <= 2:
            details.append("urgent")
        if task['estimated_hours'] <= 2:
            details.append("quick win")
        if task.get('dependencies'):
            details.append("depends on others")

    names = {
        'fastest': 'Fastest Wins',
        'impact': 'High Impact',
        'deadline': 'Deadline Driven',
        'smart': 'Smart Balance'
    }

    return f"{names.get(strategy, 'Smart Balance')} - Score {score}: " + ", ".join(details)
