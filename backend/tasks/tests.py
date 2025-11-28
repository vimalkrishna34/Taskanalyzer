from django.test import TestCase
from django.utils import timezone
from datetime import datetime, timedelta

class TaskAnalysisTests(TestCase):
    def test_analyze_tasks_endpoint(self):
        """Test the analyze tasks endpoint with sample data"""
        sample_tasks = [
            {
                "title": "Test Task",
                "due_date": (timezone.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
                "estimated_hours": 2,
                "importance": 8,
                "dependencies": []
            }
        ]
        
        response = self.client.post(
            '/api/tasks/analyze/',
            data={'tasks': sample_tasks},
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('tasks', response.json())
    
    def test_suggest_tasks_endpoint(self):
        """Test the suggest tasks endpoint"""
        response = self.client.get('/api/tasks/suggest/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('suggestions', response.json())