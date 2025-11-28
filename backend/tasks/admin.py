from django.contrib import admin
from .models import Task

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'due_date', 'importance', 'estimated_hours', 'created_at']
    list_filter = ['due_date', 'importance']
    search_fields = ['title']