// Sprint Tracker Data Validator
// Paste this into your browser console (F5 → F12 → Console) when the tracker is loaded
// It will check your Google Sheets data for common issues

(function validateTrackerData() {
    console.log('🔍 Sprint Tracker Data Validator');
    console.log('================================');

    // Check if data is loaded
    if (!window.appData) {
        console.error('❌ No appData found! Make sure the tracker loaded successfully.');
        return;
    }

    const data = window.appData;
    let errors = [];
    let warnings = [];

    // Check project config
    console.log('📋 Checking SPRINT_CONFIG...');
    if (!data.project) {
        errors.push('❌ Missing project configuration');
    } else {
        if (!data.project.name) warnings.push('⚠️ Missing sprint name');
        if (!data.project.startDate) errors.push('❌ Missing start date');
        if (!data.project.endDate) errors.push('❌ Missing end date');
        console.log(`✅ Project: ${data.project.name || 'Unnamed'}`);
        console.log(`✅ Dates: ${data.project.startDate || 'N/A'} to ${data.project.endDate || 'N/A'}`);
    }

    // Check team members
    console.log('\n👥 Checking MEMBERS...');
    if (!data.teamMembers || data.teamMembers.length === 0) {
        errors.push('❌ No team members found');
    } else {
        console.log(`✅ ${data.teamMembers.length} team members loaded`);
        data.teamMembers.forEach(member => {
            if (!member.id) warnings.push(`⚠️ Member missing ID: ${member.name}`);
            if (!member.name) warnings.push(`⚠️ Member missing name: ${member.id}`);
        });
    }

    // Check tasks
    console.log('\n📝 Checking TASKS...');
    if (!data.tasks || data.tasks.length === 0) {
        errors.push('❌ No tasks found');
    } else {
        console.log(`✅ ${data.tasks.length} tasks loaded`);
        data.tasks.forEach((task, index) => {
            if (!task.title) warnings.push(`⚠️ Task ${index + 1} missing title`);
            if (!task.startDate) warnings.push(`⚠️ Task "${task.title || 'Untitled'}" missing start date`);
            if (!task.endDate) warnings.push(`⚠️ Task "${task.title || 'Untitled'}" missing end date`);

            // Check owner exists
            if (task.owner && task.owner !== 'unassigned' && task.owner !== 'both') {
                const memberExists = data.teamMembers?.some(m => m.id === task.owner);
                if (!memberExists) {
                    warnings.push(`⚠️ Task "${task.title || 'Untitled'}" owner "${task.owner}" not found in MEMBERS`);
                }
            }

            // Check priority
            if (task.priority && !['urgent', 'normal', 'pending'].includes(task.priority.toLowerCase())) {
                warnings.push(`⚠️ Task "${task.title || 'Untitled'}" has invalid priority: ${task.priority}`);
            }
        });
    }

    // Check milestones
    console.log('\n🎯 Checking MILESTONES...');
    if (!data.milestones || data.milestones.length === 0) {
        warnings.push('⚠️ No milestones found (optional)');
    } else {
        console.log(`✅ ${data.milestones.length} milestones loaded`);
        data.milestones.forEach(milestone => {
            if (!milestone.date) warnings.push(`⚠️ Milestone "${milestone.title || 'Untitled'}" missing date`);
            if (!milestone.title) warnings.push(`⚠️ Milestone missing title`);
        });
    }

    // Summary
    console.log('\n📊 Validation Summary');
    console.log('====================');

    if (errors.length === 0 && warnings.length === 0) {
        console.log('🎉 All checks passed! Your data looks good.');
    } else {
        if (errors.length > 0) {
            console.error(`❌ ${errors.length} critical errors found:`);
            errors.forEach(error => console.error(`   ${error}`));
        }

        if (warnings.length > 0) {
            console.warn(`⚠️ ${warnings.length} warnings (non-critical):`);
            warnings.forEach(warning => console.warn(`   ${warning}`));
        }
    }

    // Data preview
    console.log('\n📈 Data Preview');
    console.log('===============');
    console.table({
        'Sprint Name': data.project?.name || 'N/A',
        'Start Date': data.project?.startDate || 'N/A',
        'End Date': data.project?.endDate || 'N/A',
        'Team Members': data.teamMembers?.length || 0,
        'Tasks': data.tasks?.length || 0,
        'Milestones': data.milestones?.length || 0
    });

    console.log('\n💡 Tips:');
    console.log('   - Use ISO dates: YYYY-MM-DD');
    console.log('   - Keep member IDs lowercase');
    console.log('   - Ensure task owners match member IDs');
    console.log('   - Use TRUE/FALSE for completed status');

})();
