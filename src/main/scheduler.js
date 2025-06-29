const cron = require('node-cron');

class Scheduler {
  constructor(dataManager, audioPlayer) {
    this.dataManager = dataManager;
    this.audioPlayer = audioPlayer;
    this.jobs = new Map();
    this.isRunning = false;
    this.isInitialized = false;
    this.nextEvents = [];
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      await this.loadSchedules();
      this.start();
      this.isInitialized = true;
      
      this.updateNextEventsCache();
      setInterval(() => this.updateNextEventsCache(), 60000);
      
    } catch (error) {
      throw error;
    }
  }

  async loadSchedules() {
    try {
      this.clearAllJobs();
      
      const schedules = this.dataManager.getAllSchedules();
      let totalEvents = 0;
      
      for (const [day, events] of Object.entries(schedules)) {
        if (Array.isArray(events)) {
          for (const event of events) {
            if (event.enabled !== false) {
              await this.addEvent(day, event);
              totalEvents++;
            }
          }
        }
      }
      
    } catch (error) {
      throw error;
    }
  }

  async reloadSchedules() {
    await this.loadSchedules();
    this.dataManager.logActivitySafe('scheduler_reloaded', 'Schedules reloaded');
  }

  async addEvent(day, event) {
    try {
      if (!event.time || !event.name) {
        return;
      }

      const timeParts = event.time.split(':');
      if (timeParts.length < 2) {
        return;
      }

      const hour = parseInt(timeParts[0]);
      const minute = parseInt(timeParts[1]);
      const second = timeParts[2] ? parseInt(timeParts[2]) : 0;

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
        return;
      }

      const dayNumbers = {
        'sunday': 0,
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6
      };

      const dayNum = dayNumbers[day.toLowerCase()];
      if (dayNum === undefined) {
        return;
      }

      const cronExpression = `${second} ${minute} ${hour} * * ${dayNum}`;
      
      if (!cron.validate(cronExpression)) {
        return;
      }

      const jobId = `${day}_${event.id || Date.now()}`;

      const job = cron.schedule(cronExpression, async () => {
        try {
          await this.executeEvent(event, day);
        } catch (error) {
          this.dataManager.logActivitySafe('schedule_execution_failed', 
            `Failed to execute "${event.name}": ${error.message}`, 
            { eventId: event.id, day, time: event.time }
          );
        }
      }, {
        scheduled: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      this.jobs.set(jobId, {
        job,
        event,
        day,
        cronExpression,
        jobId
      });

      if (this.isRunning) {
        job.start();
      }
      
    } catch (error) {
      throw error;
    }
  }

  async updateEvent(day, eventId, updatedEvent) {
    try {
      this.removeEvent(day, eventId);
      await this.addEvent(day, updatedEvent);
    } catch (error) {
      throw error;
    }
  }

  removeEvent(day, eventId) {
    try {
      const jobId = `${day}_${eventId}`;
      const jobData = this.jobs.get(jobId);
      
      if (jobData) {
        jobData.job.stop();
        jobData.job.destroy();
        this.jobs.delete(jobId);
      }
      
    } catch (error) {
      // Silent fail
    }
  }

  async executeEvent(event, day) {
    try {
      this.dataManager.logActivitySafe('schedule_executed', 
        `Executed "${event.name}" on ${day} at ${event.time}`,
        { eventId: event.id, day, time: event.time }
      );

      if (event.audioSequence && event.audioSequence.length > 0) {
        await this.audioPlayer.playEventSequence(event);
      } else {
        this.dataManager.logActivitySafe('schedule_no_audio', 
          `Event "${event.name}" has no audio sequence defined`
        );
      }
      
    } catch (error) {
      this.dataManager.logActivitySafe('schedule_execution_error', 
        `Error executing "${event.name}": ${error.message}`
      );
      throw error;
    }
  }

  async testEvent(day, event) {
    try {
      if (!event.audioSequence || event.audioSequence.length === 0) {
        throw new Error('Event has no audio sequence to test');
      }

      await this.audioPlayer.validateAudioSequence(event.audioSequence);
      await this.executeEvent(event, day);
      
      this.dataManager.logActivitySafe('schedule_tested', 
        `Tested event "${event.name}" manually`
      );
      
      return { success: true, message: `Event "${event.name}" tested successfully` };
      
    } catch (error) {
      this.dataManager.logActivitySafe('schedule_test_failed', 
        `Test failed for "${event.name}": ${error.message}`
      );
      throw error;
    }
  }

  start() {
    if (this.isRunning) {
      return;
    }
    
    for (const [jobId, jobData] of this.jobs) {
      try {
        jobData.job.start();
      } catch (error) {
        // Silent fail
      }
    }
    
    this.isRunning = true;
    
    this.dataManager.logActivitySafe('scheduler_started', 
      `Scheduler started with ${this.jobs.size} jobs`
    );
  }

  stop() {
    if (!this.isRunning) {
      return;
    }
    
    for (const [jobId, jobData] of this.jobs) {
      try {
        jobData.job.stop();
      } catch (error) {
        // Silent fail
      }
    }
    
    this.isRunning = false;
    this.dataManager.logActivitySafe('scheduler_stopped', 'Scheduler stopped');
  }

  clearAllJobs() {
    for (const [jobId, jobData] of this.jobs) {
      try {
        jobData.job.stop();
        jobData.job.destroy();
      } catch (error) {
        // Silent fail
      }
    }
    
    this.jobs.clear();
  }

  getStatus() {
    const jobs = Array.from(this.jobs.values()).map(jobData => ({
      jobId: jobData.jobId,
      eventName: jobData.event.name,
      day: jobData.day,
      time: jobData.event.time,
      cronExpression: jobData.cronExpression,
      enabled: jobData.event.enabled !== false,
      isRunning: this.isRunning
    }));

    return {
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      totalJobs: this.jobs.size,
      nextEvents: this.nextEvents.slice(0, 5),
      jobs: jobs
    };
  }

  updateNextEventsCache() {
    try {
      const now = new Date();
      const upcoming = [];
      
      const currentDay = now.getDay();
      const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDay = (currentDay + dayOffset) % 7;
        const dayName = dayNames[checkDay];
        
        const daySchedule = this.dataManager.getSchedule(dayName);
        
        for (const event of daySchedule) {
          if (event.enabled === false) continue;
          
          const timeParts = event.time.split(':');
          const eventTime = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + (timeParts[2] ? parseInt(timeParts[2]) : 0);
          
          if (dayOffset === 0 && eventTime <= currentTime) {
            continue;
          }
          
          const nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + dayOffset);
          nextDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), timeParts[2] ? parseInt(timeParts[2]) : 0, 0);
          
          upcoming.push({
            name: event.name,
            time: event.time,
            day: dayName,
            date: nextDate,
            timeUntil: Math.floor((nextDate.getTime() - now.getTime()) / 1000)
          });
        }
      }
      
      upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
      this.nextEvents = upcoming.slice(0, 10);
      
    } catch (error) {
      // Silent fail
    }
  }

  getNextEvents(limit = 5) {
    this.updateNextEventsCache();
    return this.nextEvents.slice(0, limit);
  }

  getTodayEvents() {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[today.getDay()];
    
    const todaySchedule = this.dataManager.getSchedule(todayName);
    const currentTime = today.getHours() * 3600 + today.getMinutes() * 60 + today.getSeconds();
    
    return todaySchedule.map(event => {
      const timeParts = event.time.split(':');
      const eventTime = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + (timeParts[2] ? parseInt(timeParts[2]) : 0);
      
      return {
        ...event,
        isPast: eventTime < currentTime,
        isNext: eventTime >= currentTime
      };
    }).sort((a, b) => a.time.localeCompare(b.time));
  }

  validateCronExpression(expression) {
    return cron.validate(expression);
  }

  getStatistics() {
    const schedules = this.dataManager.getAllSchedules();
    let totalEvents = 0;
    let enabledEvents = 0;
    let eventsPerDay = {};
    
    for (const [day, events] of Object.entries(schedules)) {
      eventsPerDay[day] = events.length;
      totalEvents += events.length;
      enabledEvents += events.filter(e => e.enabled !== false).length;
    }
    
    return {
      totalEvents,
      enabledEvents,
      disabledEvents: totalEvents - enabledEvents,
      eventsPerDay,
      activeJobs: this.jobs.size,
      isRunning: this.isRunning
    };
  }

  cleanup() {
    this.stop();
    this.clearAllJobs();
  }

  async emergencyStop() {
    try {
      this.stop();
      await this.audioPlayer.stop();
      
      this.dataManager.logActivitySafe('emergency_stop', 'Emergency stop activated');
      
      return { success: true, message: 'Emergency stop completed' };
      
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Scheduler;