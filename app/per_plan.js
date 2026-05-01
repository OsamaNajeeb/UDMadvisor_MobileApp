import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, Platform } from 'react-native';
import { Text, Appbar, Button, Card, Divider, TextInput, IconButton } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import FeedbackButton from '../components/FeedbackButton';
import {
  buildEnvelope,
  envelopeToJson,
  envelopeToShareString,
  loadImportedPlan,
  renameImportedPlan,
  updateImportedPlan,
} from '../utils/planStorage';

const API_BASE_URL = "https://scraper2-nzef.onrender.com";

// --- HELPERS ---
const getTitleColor = (level) => {
  switch (level) {
    case 'Freshman': return '#99d24d';
    case 'Sophomore': return '#5dd4ff';
    case 'Junior': return '#e8bcb4';
    case 'Senior': return '#b8a4c4';
    case 'Graduate': return '#b5ebf2';
    default: return '#e2e8f0';
  }
};

const isCompleted = (status) => {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'substituted' || s === 'waived' || s === 'transferred';
};

const getStatusColor = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'planned': return '#ffeba8';
    case 'in progress': return '#a5daff';
    case 'completed': return '#b6ffbc';
    case 'failed': return '#ffbdc6';
    case 'substituted': return '#f7c2ff';
    case 'waived': return '#d7ffaa';
    case 'transferred': return '#9fffe2';
    default: return '#f0f0f0'; 
  }
};

const getStatusLabel = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'planned': return 'Planned';
    case 'in progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'substituted': return 'Substituted';
    case 'waived': return 'Waived';
    case 'transferred': return 'Transferred';
    default: return 'None';
  }
};

export default function PersonalizePlan() {
  const router = useRouter();
  const { plan_id, year_id, import_id } = useLocalSearchParams();
  const isImported = Boolean(import_id);

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Share loading state
  const [isLinking, setIsLinking] = useState(false);

  // Export modal state
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportName, setExportName] = useState('');

  // Open the export modal and pre-fill the name with the plan's program title.
  const openExportModal = () => {
    setExportName(plan?.program || 'Degree Plan');
    setExportModalVisible(true);
  };

  // Single shared status picker modal (instead of 40+ inline Pickers)
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusModalTarget, setStatusModalTarget] = useState(null);
  const [tempStatus, setTempStatus] = useState('');

  // Single shared note editor modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteModalTarget, setNoteModalTarget] = useState(null);
  const [tempNote, setTempNote] = useState('');

  useEffect(() => {
    setPlan(null);
    setLoading(true);

    const hydrate = (rawPlan) => {
      // rawPlan looks like { program, plan: { semesters: [...] }, ... }
      return rawPlan.plan.semesters.map(sem => ({
        ...sem,
        courses: sem.courses.map(course => {
          if (course.type === 'group') {
            return {
              ...course,
              courses: course.courses.map(or_group =>
                or_group.map(inner => ({ ...inner, status: inner.status || '', notes: inner.notes || '' }))
              )
            };
          }
          return { ...course, status: course.status || '', notes: course.notes || '' };
        })
      }));
    };

    const loadFromImport = async () => {
      try {
        const env = await loadImportedPlan(import_id);
        if (!env) throw new Error("Imported plan not found. It may have been deleted.");
        // envelope wraps the original plan under env.plan
        const raw = env.plan;
        // Prefer the envelope-level "name" (which is the user-chosen display
        // name, settable at import time and via export-modal rename) over
        // the raw program field. This is what the user expects to see in
        // the header and have prefilled into the export modal. Fall back
        // to raw.program for envelopes saved before names existed.
        const displayProgram = (env.name && env.name.trim()) || raw.program || 'Imported Plan';
        setPlan({
          ...raw,
          program: displayProgram,
          plan: {
            ...raw.plan,
            semesters: hydrate(raw),
          }
        });
      } catch (error) {
        console.error("Error loading imported plan:", error);
        Alert.alert("Error", error.message || "Could not open imported plan.");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    const fetchPlanDetails = async () => {
      if (!plan_id || !year_id) {
        Alert.alert("Error", "Missing plan details.");
        router.back();
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/get_plan?plan_id=${plan_id}&year_id=${year_id}`);
        
        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          throw new Error("Server returned an invalid response. It may be starting up — try again in a moment.");
        }
        
        if (!response.ok) throw new Error(data?.message || "Failed to fetch plan details");

        setPlan({
          ...data,
          plan: {
            ...data.plan,
            semesters: hydrate(data)
          }
        });
        
      } catch (error) {
        console.error("Error fetching plan:", error);
        Alert.alert("Connection Error", "Could not load the plan details.");
      } finally {
        setLoading(false);
      }
    };

    if (isImported) {
      loadFromImport();
    } else {
      fetchPlanDetails();
    }
  }, [plan_id, year_id, import_id, isImported]);

  // --- DEEP-UPDATE HELPERS ---
  // Update a single course's status using STRUCTURAL SHARING — we only clone
  // the path from the root down to the changed course, and reuse references
  // for everything else. This matters a lot on low-memory devices (the
  // previous JSON.parse(JSON.stringify(prev)) cloned the entire plan on
  // every tap, which spiked memory and crashed the app after a few changes).
  //
  // The plan tree shape is:
  //   plan.plan.semesters[semIdx].courses[courseIdx]            (regular course)
  //   plan.plan.semesters[semIdx].courses[courseIdx].courses[orIdx][innerIdx]  (OR-group)
  const updateCourseStatus = useCallback((semIdx, courseIdx, newStatus) => {
    setPlan(prev => {
      if (!prev) return prev;
      const semesters = prev.plan.semesters.slice();
      const sem = { ...semesters[semIdx] };
      const courses = sem.courses.slice();
      courses[courseIdx] = { ...courses[courseIdx], status: newStatus };
      sem.courses = courses;
      semesters[semIdx] = sem;
      return { ...prev, plan: { ...prev.plan, semesters } };
    });
  }, []);

  const updateGroupCourseStatus = useCallback((semIdx, courseIdx, orIdx, innerIdx, newStatus) => {
    setPlan(prev => {
      if (!prev) return prev;
      const semesters = prev.plan.semesters.slice();
      const sem = { ...semesters[semIdx] };
      const courses = sem.courses.slice();
      const group = { ...courses[courseIdx] };
      const orGroups = group.courses.slice();
      const orGroup = orGroups[orIdx].slice();
      orGroup[innerIdx] = { ...orGroup[innerIdx], status: newStatus };
      orGroups[orIdx] = orGroup;
      group.courses = orGroups;
      courses[courseIdx] = group;
      sem.courses = courses;
      semesters[semIdx] = sem;
      return { ...prev, plan: { ...prev.plan, semesters } };
    });
  }, []);

  const updateCourseNote = useCallback((semIdx, courseIdx, newNote) => {
    setPlan(prev => {
      if (!prev) return prev;
      const semesters = prev.plan.semesters.slice();
      const sem = { ...semesters[semIdx] };
      const courses = sem.courses.slice();
      courses[courseIdx] = { ...courses[courseIdx], notes: newNote };
      sem.courses = courses;
      semesters[semIdx] = sem;
      return { ...prev, plan: { ...prev.plan, semesters } };
    });
  }, []);

  const updateGroupCourseNote = useCallback((semIdx, courseIdx, orIdx, innerIdx, newNote) => {
    setPlan(prev => {
      if (!prev) return prev;
      const semesters = prev.plan.semesters.slice();
      const sem = { ...semesters[semIdx] };
      const courses = sem.courses.slice();
      const group = { ...courses[courseIdx] };
      const orGroups = group.courses.slice();
      const orGroup = orGroups[orIdx].slice();
      orGroup[innerIdx] = { ...orGroup[innerIdx], notes: newNote };
      orGroups[orIdx] = orGroup;
      group.courses = orGroups;
      courses[courseIdx] = group;
      sem.courses = courses;
      semesters[semIdx] = sem;
      return { ...prev, plan: { ...prev.plan, semesters } };
    });
  }, []);

  // --- STATUS MODAL HANDLERS ---
  const openStatusPicker = useCallback((semIdx, cidx, orIdx, iidx, currentStatus) => {
    setStatusModalTarget({ semIdx, cidx, orIdx, iidx });
    setTempStatus(currentStatus || '');
    setStatusModalVisible(true);
  }, []);

  const confirmStatus = useCallback(() => {
    if (!statusModalTarget) return;
    const { semIdx, cidx, orIdx, iidx } = statusModalTarget;
    if (orIdx !== undefined && iidx !== undefined) {
      updateGroupCourseStatus(semIdx, cidx, orIdx, iidx, tempStatus);
    } else {
      updateCourseStatus(semIdx, cidx, tempStatus);
    }
    setStatusModalVisible(false);
    setStatusModalTarget(null);
  }, [statusModalTarget, tempStatus, updateCourseStatus, updateGroupCourseStatus]);

  // --- NOTE MODAL HANDLERS ---
  const openNoteEditor = useCallback((semIdx, cidx, orIdx, iidx, currentNote) => {
    setNoteModalTarget({ semIdx, cidx, orIdx, iidx });
    setTempNote(currentNote || '');
    setNoteModalVisible(true);
  }, []);

  const confirmNote = useCallback(() => {
    if (!noteModalTarget) return;
    const { semIdx, cidx, orIdx, iidx } = noteModalTarget;
    if (orIdx !== undefined && iidx !== undefined) {
      updateGroupCourseNote(semIdx, cidx, orIdx, iidx, tempNote);
    } else {
      updateCourseNote(semIdx, cidx, tempNote);
    }
    setNoteModalVisible(false);
    setNoteModalTarget(null);
  }, [noteModalTarget, tempNote, updateCourseNote, updateGroupCourseNote]);

  // --- SHARE PLAN ---
  const sharePlan = async () => {
    try {
      setIsLinking(true);

      // Build a nicely formatted text version of the plan
      let shareText = `📋 ${plan.program || 'Degree Plan'}\n`;
      if (plan.minor) shareText += `Minor: ${plan.minor}\n`;
      shareText += `\n`;

      const semesters = plan.plan?.semesters || [];
      semesters.forEach(sem => {
        if (sem.term === 'd') return;
        shareText += `━━━ ${sem.level} - ${sem.term} ━━━\n`;

        sem.courses.forEach(course => {
          if (course.type === 'group') {
            course.courses.forEach((or_group, orIdx) => {
              or_group.forEach(inner => {
                const status = inner.status ? ` [${getStatusLabel(inner.status)}]` : '';
                shareText += `  ${inner.subject} ${inner.number} - ${(inner.name || '').replace(/&amp;/g, '&')} (${inner.credits || 0} cr)${status}\n`;
                if (inner.notes) shareText += `    📝 ${inner.notes}\n`;
              });
              if (orIdx < course.courses.length - 1) shareText += `    — OR —\n`;
            });
          } else {
            const code = course.subject === 'Elective' ? 'Elective' : `${course.subject} ${course.number}`;
            const status = course.status ? ` [${getStatusLabel(course.status)}]` : '';
            shareText += `  ${code} - ${(course.name || '').replace(/&amp;/g, '&')} (${course.credits || 0} cr)${status}\n`;
            if (course.notes) shareText += `    📝 ${course.notes}\n`;
          }
        });
        shareText += `\n`;
      });

      shareText += `Shared from UDM Advisor`;

      await Share.share({
        message: shareText,
        title: `${plan.program || 'Degree Plan'} - UDM Advisor`,
      });

    } catch (err) {
      if (err.message !== 'User did not share') {
        console.error(err);
        Alert.alert("Error", "Could not share the plan.");
      }
    } finally {
      setIsLinking(false);
    }
  };

  // Resolve the user-chosen export name. Falls back to the plan's program
  // if the field was cleared. Never returns an empty string.
  const resolveExportName = () => {
    const n = (exportName || '').trim();
    return n || plan?.program || 'Degree Plan';
  };

  // After a successful export, if this is an IMPORTED plan AND the user
  // typed a new name in the export modal, persist that name as the plan's
  // display name. This is what makes the on-screen header update to match
  // the chosen name. We do nothing for catalog plans — those keep their
  // original program title regardless of what was typed.
  const applyRenameIfImported = async (chosenName) => {
    if (!isImported || !import_id) return;
    const trimmed = (chosenName || '').trim();
    if (!trimmed) return;
    if (trimmed === (plan?.program || '')) return; // no-op
    try {
      await renameImportedPlan(import_id, trimmed);
      // Also update local state so the header reflects the change without
      // a screen reload. Non-mutating: rebuild the plan object.
      setPlan(prev => prev ? { ...prev, program: trimmed } : prev);
    } catch (e) {
      console.warn('Failed to persist plan rename:', e);
      // Don't show an alert — the export itself succeeded; rename is
      // a bonus side-effect.
    }
  };

  // Resolve + (fire-and-forget) persist the new name if applicable.
  // Every export handler should call this exactly once.
  const resolveAndCommitName = () => {
    const name = resolveExportName();
    // Don't await — the export shouldn't block on AsyncStorage writes.
    applyRenameIfImported(name);
    return name;
  };

  // After every successful export, if this is an imported plan, write the
  // freshly-built envelope back to AsyncStorage. This keeps the imported
  // plan in Plan Viewer in sync with the file the user just exported, so
  // the next time they open it, edits are there — no manual re-import.
  //
  // Catalog plans (no import_id) skip this — there's no AsyncStorage entry
  // to update for them.
  //
  // Fire-and-forget; failure is logged but never blocks the export. The
  // file write succeeded, which is the user's primary intent; the cache
  // sync is a convenience.
  const persistImportedSnapshotIfNeeded = (env) => {
    if (!isImported || !import_id) return;
    updateImportedPlan(import_id, env)
      .then(ok => {
        if (!ok) {
          console.warn('[persist] updateImportedPlan returned false (id missing in index)');
        }
      })
      .catch(e => {
        console.warn('[persist] failed to sync imported plan:', e);
      });
  };

  // --- BUILD HTML FOR PDF ---
  // Pure function. Takes the hydrated plan object and returns a styled HTML
  // string ready for expo-print. Colors mirror the in-app palette (see
  // getTitleColor / getStatusColor at the top of this file) so a printed
  // plan looks familiar to anyone who's used the app.
  const buildPlanHtml = (planObj, chosenName) => {
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/&amp;amp;/g, '&amp;'); // Un-double-escape the &amp; that comes from the API

    const headerColorFor = (level) => ({
      Freshman: '#99d24d', Sophomore: '#5dd4ff', Junior: '#e8bcb4',
      Senior: '#b8a4c4', Graduate: '#b5ebf2',
    }[level] || '#e2e8f0');

    const statusColorFor = (status) => {
      switch ((status || '').toLowerCase()) {
        case 'planned': return '#ffeba8';
        case 'in progress': return '#a5daff';
        case 'completed': return '#b6ffbc';
        case 'failed': return '#ffbdc6';
        case 'substituted': return '#f7c2ff';
        case 'waived': return '#d7ffaa';
        case 'transferred': return '#9fffe2';
        default: return '#ffffff';
      }
    };

    const statusLabelFor = (status) => {
      const s = (status || '').toLowerCase();
      if (!s) return '';
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const renderCourse = (c) => {
      const code = c.subject === 'Elective' ? 'Elective' : `${esc(c.subject || '')} ${esc(c.number || '')}`.trim();
      const name = esc((c.name || '').replace(/&amp;/g, '&'));
      const credits = c.credits ?? 0;
      const statusLabel = statusLabelFor(c.status);
      const bg = statusColorFor(c.status);
      const badge = statusLabel
        ? `<span class="badge">${esc(statusLabel)}</span>`
        : '';
      const notes = c.notes
        ? `<div class="note">📝 ${esc(c.notes)}</div>`
        : '';
      return `
        <div class="course" style="background:${bg}">
          <div class="course-head">
            <span class="code">${code}</span>
            <span class="credits">${credits} cr</span>
          </div>
          <div class="course-name">${name}${badge ? ' ' + badge : ''}</div>
          ${notes}
        </div>`;
    };

    const renderGroup = (group) => {
      // group.courses is [[option1_courses], [option2_courses], ...]
      const orGroups = (group.courses || []).map(orGroup => {
        const inner = (orGroup || []).map(renderCourse).join('');
        return `<div class="or-option">${inner}</div>`;
      });
      return `
        <div class="or-group">
          <div class="or-label">Choose one:</div>
          ${orGroups.join('<div class="or-separator">— or —</div>')}
        </div>`;
    };

    const semesters = (planObj?.plan?.semesters || []).filter(s => s.term !== 'd');
    const semesterHtml = semesters.map(sem => {
      const headerColor = headerColorFor(sem.level);
      const courseHtml = (sem.courses || []).map(c => {
        return c.type === 'group' ? renderGroup(c) : renderCourse(c);
      }).join('');
      // Compute per-semester credit total (sum non-group; for groups, take the first option)
      let semCredits = 0;
      (sem.courses || []).forEach(c => {
        if (c.type === 'group') {
          const first = c.courses?.[0]?.[0];
          if (first) semCredits += Number(first.credits || 0);
        } else {
          semCredits += Number(c.credits || 0);
        }
      });
      return `
        <section class="semester">
          <div class="semester-head" style="background:${headerColor}">
            <span class="sem-title">${esc(sem.level || '')} — ${esc(sem.term || '')}</span>
            <span class="sem-credits">${semCredits} cr</span>
          </div>
          <div class="semester-body">
            ${courseHtml || '<div class="empty">No courses</div>'}
          </div>
        </section>`;
    }).join('');

    const program = esc(planObj?.program || 'Degree Plan');
    const minor = planObj?.minor ? `<div class="minor">Minor: ${esc(planObj.minor)}</div>` : '';
    const exportedOn = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    const fileTitle = esc(chosenName || program);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${fileTitle}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #222;
    margin: 0;
    padding: 0;
    font-size: 10.5pt;
    line-height: 1.35;
  }
  header {
    border-bottom: 3px solid #A5093E;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }
  h1 {
    color: #A5093E;
    font-size: 20pt;
    margin: 0 0 4px 0;
  }
  .program { color: #555; font-size: 11pt; margin-bottom: 2px; }
  .minor { color: #555; font-size: 10pt; font-style: italic; }
  .meta { color: #888; font-size: 9pt; margin-top: 6px; }
  .semester { margin-bottom: 14px; page-break-inside: avoid; }
  .semester-head {
    padding: 6px 10px;
    border-radius: 4px 4px 0 0;
    font-weight: 700;
    color: #111;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sem-title { font-size: 11.5pt; }
  .sem-credits { font-size: 10pt; opacity: 0.8; }
  .semester-body {
    border: 1px solid #ddd;
    border-top: none;
    border-radius: 0 0 4px 4px;
    padding: 4px;
  }
  .course {
    border: 1px solid #d8d8d8;
    border-radius: 3px;
    padding: 6px 8px;
    margin: 4px 0;
    page-break-inside: avoid;
  }
  .course-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .code { font-weight: 700; color: #A5093E; font-size: 10.5pt; }
  .credits { color: #444; font-size: 9.5pt; font-weight: 600; }
  .course-name { color: #222; margin-top: 2px; }
  .badge {
    display: inline-block;
    background: #fff;
    border: 1px solid #999;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 8.5pt;
    color: #333;
    margin-left: 4px;
    font-weight: 600;
  }
  .note {
    font-size: 9pt;
    color: #555;
    margin-top: 3px;
    font-style: italic;
  }
  .or-group {
    background: #f6f6f6;
    border: 1px dashed #bbb;
    border-radius: 3px;
    padding: 6px;
    margin: 4px 0;
  }
  .or-label {
    font-size: 9pt;
    font-weight: 700;
    color: #A5093E;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .or-option .course { margin: 2px 0; }
  .or-separator {
    text-align: center;
    color: #888;
    font-size: 9pt;
    font-style: italic;
    padding: 2px 0;
  }
  .empty { padding: 8px; color: #999; font-style: italic; text-align: center; }
  footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #ddd;
    text-align: center;
    color: #999;
    font-size: 8.5pt;
  }
</style>
</head>
<body>
  <header>
    <h1>${fileTitle}</h1>
    <div class="program">${program}</div>
    ${minor}
    <div class="meta">Exported ${exportedOn} · UDM Advisor</div>
  </header>
  ${semesterHtml || '<p>This plan has no semesters.</p>'}
  <footer>Generated by UDM Advisor · University of Detroit Mercy</footer>
</body>
</html>`;
  };

  // --- EXPORT AS PDF ---
  // Renders the plan to styled HTML, uses expo-print to produce a PDF, then
  // copies it to a properly-named file and opens the share sheet. Same
  // lazy-load pattern as the other export handlers so a missing native
  // module doesn't take down the screen.
  const handleExportPDF = async () => {
    if (!plan || exportBusy) return;
    setExportBusy(true);
    try {
      let Print, File, Paths, Sharing;
      try {
        Print = require('expo-print');
        ({ File, Paths } = require('expo-file-system'));
        Sharing = require('expo-sharing');
      } catch (e) {
        throw new Error('PDF export is not available in this build. Try "Share file…" or "Copy shareable code" instead.');
      }
      if (!Print?.printToFileAsync || !File || !Paths) {
        throw new Error('This Expo build is missing the PDF module. Rebuild the app with `npx expo run:android` to include it.');
      }

      const chosenName = resolveAndCommitName();
      const html = buildPlanHtml(plan, chosenName);

      // Step 1: print HTML → PDF (lands in cache with a random filename)
      const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

      // Step 2: copy to a properly-named file in the document directory so
      // the share sheet and downstream apps show a nice name.
      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.pdf`;

      const src = new File(tmpUri);
      const dest = new File(Paths.document, filename);
      if (dest.exists) dest.delete();
      src.copy(dest);

      // Step 3: share it (same pattern as handleExportFile)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share your UDM degree plan',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          'Saved',
          `PDF saved to:\n${dest.uri}\n\nSharing isn't available on this device, but the file is on disk.`
        );
      }
      setExportModalVisible(false);
    } catch (e) {
      console.error('Export PDF error:', e);
      Alert.alert('PDF export failed', e.message || 'Could not create the PDF.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- SAVE PDF TO A USER-PICKED FOLDER (Android only, via SAF) ---
  //
  // Same pattern as handleExportToFolder but for PDFs. On Android the user
  // picks a folder (Downloads, Documents, Drive, anywhere), we generate the
  // PDF, then write it directly to the chosen folder as binary (base64).
  //
  // iOS doesn't have an equivalent OS-level folder picker, so this handler
  // falls back to the share sheet path on non-Android platforms.
  const handleExportPDFToFolder = async () => {
    if (!plan || exportBusy) return;
    if (Platform.OS !== 'android') {
      return handleExportPDF();
    }
    setExportBusy(true);
    try {
      let Print, File, Paths, StorageAccessFramework, readAsStringAsync, writeAsStringAsync, deleteAsync, EncodingType;
      try {
        Print = require('expo-print');
        ({ File, Paths } = require('expo-file-system'));
        const legacy = require('expo-file-system/legacy');
        StorageAccessFramework = legacy.StorageAccessFramework;
        readAsStringAsync = legacy.readAsStringAsync;
        writeAsStringAsync = legacy.writeAsStringAsync;
        deleteAsync = legacy.deleteAsync;
        EncodingType = legacy.EncodingType;
      } catch (e) {
        throw new Error('PDF folder save is not available in this build. Use "Share PDF…" and pick "Save to device" from the share sheet.');
      }
      if (!Print?.printToFileAsync || !StorageAccessFramework || !writeAsStringAsync || !readAsStringAsync || !deleteAsync) {
        throw new Error('This Expo build is missing PDF or folder-picker support. Rebuild the app to enable it.');
      }

      const chosenName = resolveAndCommitName();
      const html = buildPlanHtml(plan, chosenName);

      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.pdf`;

      // Step 1: print HTML → PDF (cache dir)
      const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

      // Step 2: ask user for a destination folder.
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        setExportBusy(false);
        return;
      }

      // Check for an existing same-named PDF in the chosen folder. If
      // present, confirm with the user and delete it before creating the
      // new file (so SAF doesn't auto-rename to "Name (1).pdf").
      const existingUri = await findExistingFileInSafFolder(
        StorageAccessFramework, perm.directoryUri, filename
      );
      if (existingUri) {
        const ok = await confirmOverwrite(filename);
        if (!ok) {
          setExportBusy(false);
          return;
        }
        try {
          await deleteAsync(existingUri, { idempotent: true });
        } catch (e) {
          console.warn('Could not delete existing PDF before replace; SAF may suffix:', e);
        }
      }

      // Step 3: read the generated PDF as base64, then write it into the
      // SAF-created file as base64. SAF URIs don't work with File.copy()
      // from the new API, so we go through the legacy read/write as binary.
      const base64 = await readAsStringAsync(tmpUri, {
        encoding: EncodingType?.Base64 || 'base64',
      });

      const destUri = await StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        filename,
        'application/pdf'
      );
      await writeAsStringAsync(destUri, base64, {
        encoding: EncodingType?.Base64 || 'base64',
      });

      setExportModalVisible(false);
      Alert.alert(
        existingUri ? 'Replaced' : 'Saved',
        `"${filename}" was ${existingUri ? 'updated' : 'saved'} in the folder you chose.`
      );
    } catch (e) {
      console.error('Export PDF to folder error:', e);
      Alert.alert('Save failed', e.message || 'Could not save the PDF to that folder.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- EXPORT AS .udmplan FILE ---
  const handleExportFile = async () => {
    if (!plan || exportBusy) return;
    setExportBusy(true);
    try {
      // Lazy-load native modules. Importing them at the top of the file
      // crashes the whole screen at module-load time if the native
      // side isn't wired up (happens in some Expo Go builds). Requiring
      // them here makes failures catchable and keeps the screen alive.
      let File, Paths, Sharing;
      try {
        ({ File, Paths } = require('expo-file-system'));
        Sharing = require('expo-sharing');
      } catch (e) {
        throw new Error('File system features are not available in this build. Try "Copy shareable code" instead.');
      }
      if (!File || !Paths) {
        throw new Error('This Expo build does not support file saving. Try "Copy shareable code" instead, or rebuild the app.');
      }

      const chosenName = resolveAndCommitName();
      const env = buildEnvelope(plan, { name: chosenName });
      persistImportedSnapshotIfNeeded(env);
      const json = envelopeToJson(env);

      // Make a safe filename from the chosen name
      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.udmplan`;

      // expo-file-system 19 API: File(Paths.document, name).write(text)
      const file = new File(Paths.document, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Share your UDM degree plan',
          UTI: 'public.json',
        });
      } else {
        Alert.alert(
          'Saved',
          `Plan saved to:\n${file.uri}\n\nSharing isn't available on this device, but the file is on disk.`
        );
      }
      setExportModalVisible(false);
    } catch (e) {
      console.error('Export file error:', e);
      Alert.alert('Export failed', e.message || 'Could not export the plan.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- EXPORT TO A USER-PICKED FOLDER (Android only, via SAF) ---
  //
  // On Android this opens the system folder picker so the user can pick a
  // destination (Downloads, Documents, Drive, anywhere they have write
  // access). On iOS this is unsupported by the OS — apps don't get to write
  // to arbitrary paths — so we just fall back to the share sheet.
  // Helper: given a granted SAF folder URI and a filename, look inside the
  // folder for a file with that name. Returns the existing file's SAF URI
  // if found, or null if not.
  //
  // Matches in two passes: first the literal target ("MyPlan.udmplan"),
  // then a legacy ".json"-suffixed variant ("MyPlan.udmplan.json"). The
  // legacy variant exists because older versions of this app passed an
  // 'application/json' MIME type to SAF, and SAF appends a canonical
  // extension when the filename's extension doesn't match the MIME's. New
  // saves use 'application/octet-stream' and stay correctly named.
  //
  // Boundary check (chars before/after the matched substring) avoids
  // false matches like "MyPlan.udmplan (1).json" matching against
  // "MyPlan.udmplan" — that's a different file and shouldn't overwrite.
  const findExistingFileInSafFolder = async (StorageAccessFramework, directoryUri, filename) => {
    try {
      const entries = await StorageAccessFramework.readDirectoryAsync(directoryUri);
      const lcTarget = filename.toLowerCase();
      const lcTargetWithJson = lcTarget + '.json';

      const tryMatch = (lcDecoded, needle) => {
        const idx = lcDecoded.lastIndexOf(needle);
        if (idx === -1) return false;
        const before = idx === 0 ? '' : lcDecoded[idx - 1];
        const afterPos = idx + needle.length;
        const after = afterPos >= lcDecoded.length ? '' : lcDecoded[afterPos];
        const goodBefore = before === '' || before === '/' || before === ':';
        const goodAfter = after === '' || after === '?' || after === '#';
        return goodBefore && goodAfter;
      };

      for (const uri of entries || []) {
        let decoded;
        try { decoded = decodeURIComponent(uri); }
        catch { decoded = uri; }
        const lcDecoded = decoded.toLowerCase();
        if (tryMatch(lcDecoded, lcTarget) || tryMatch(lcDecoded, lcTargetWithJson)) {
          return uri;
        }
      }
    } catch (e) {
      // readDirectoryAsync rarely fails on a granted folder, but if it does
      // we treat it as "no existing file" rather than blocking the save.
      console.warn('Could not list SAF folder; will create instead of overwriting:', e);
    }
    return null;
  };

  // Helper: prompt the user to confirm overwriting an existing file.
  // Resolves true if user confirms, false on cancel.
  const confirmOverwrite = (filename) => new Promise((resolve) => {
    Alert.alert(
      'Replace existing file?',
      `"${filename}" already exists in that folder. Replace it with the current plan?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

  const handleExportToFolder = async () => {
    if (!plan || exportBusy) return;
    if (Platform.OS !== 'android') {
      // iOS: silently fall through to the share-sheet flow.
      return handleExportFile();
    }
    setExportBusy(true);
    try {
      // Lazy-load — same reasoning as handleExportFile.
      let StorageAccessFramework, writeAsStringAsync, deleteAsync;
      try {
        const legacy = require('expo-file-system/legacy');
        StorageAccessFramework = legacy.StorageAccessFramework;
        writeAsStringAsync = legacy.writeAsStringAsync;
        deleteAsync = legacy.deleteAsync;
      } catch (e) {
        throw new Error('Folder picker is not available in this build. Use "Share file…" and pick "Save to device" from the share sheet.');
      }
      if (!StorageAccessFramework || !writeAsStringAsync || !deleteAsync) {
        throw new Error('This Expo build does not support the folder picker. Use "Share file…" instead.');
      }

      const chosenName = resolveAndCommitName();
      const env = buildEnvelope(plan, { name: chosenName });
      persistImportedSnapshotIfNeeded(env);
      const json = envelopeToJson(env);

      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.udmplan`;

      // Ask the user to pick a folder. Returns { granted, directoryUri }.
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        // They cancelled the picker — not an error, just bail.
        setExportBusy(false);
        return;
      }

      // Check whether the same filename already exists in that folder.
      // If it does, ask the user before replacing it. Without this step,
      // SAF would auto-rename the new file to "Name (1).udmplan", which
      // is exactly the duplication the user is trying to avoid.
      const existingUri = await findExistingFileInSafFolder(
        StorageAccessFramework, perm.directoryUri, filename
      );
      if (existingUri) {
        const ok = await confirmOverwrite(filename);
        if (!ok) {
          setExportBusy(false);
          return;
        }
        // Delete first so the new file gets the exact name (no suffix).
        try {
          await deleteAsync(existingUri, { idempotent: true });
        } catch (e) {
          console.warn('Could not delete existing file before replace; SAF may suffix:', e);
        }
      }

      const fileUri = await StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        filename,
        // 'application/octet-stream' (NOT 'application/json'). SAF appends
        // a canonical extension when the MIME type's known extension
        // doesn't match the filename's. Passing JSON to a .udmplan file
        // produces "MyPlan.udmplan.json" on disk. octet-stream is the
        // generic binary type and tells SAF to keep our extension as-is.
        'application/octet-stream'
      );
      await writeAsStringAsync(fileUri, json); // default UTF-8

      setExportModalVisible(false);
      Alert.alert(
        existingUri ? 'Replaced' : 'Saved',
        `"${filename}" was ${existingUri ? 'updated' : 'saved'} in the folder you chose.`
      );
    } catch (e) {
      console.error('Export to folder error:', e);
      Alert.alert('Save failed', e.message || 'Could not save the plan to that folder.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- EXPORT AS SHAREABLE CODE ---
  const handleExportCode = async () => {
    if (!plan || exportBusy) return;
    setExportBusy(true);
    try {
      const chosenName = resolveAndCommitName();
      const env = buildEnvelope(plan, { name: chosenName });
      persistImportedSnapshotIfNeeded(env);
      const code = envelopeToShareString(env);
      await Clipboard.setStringAsync(code);
      Alert.alert(
        'Copied!',
        `A shareable code for "${chosenName}" has been copied to your clipboard. Anyone with the code can import this plan into their UDM Advisor app.`
      );
      setExportModalVisible(false);
    } catch (e) {
      console.error('Export code error:', e);
      Alert.alert('Export failed', e.message || 'Could not generate code.');
    } finally {
      setExportBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#A5093E" />
        <Text style={{ marginTop: 10 }}>Loading Editor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Personalize Plan" color="#fff" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBox}>
          <Text variant="headlineSmall" style={styles.titleText}>{plan.program}</Text>
          <Text style={styles.yearText}>Update your course statuses below to track your progress.</Text>
          
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
            <Button
              mode="contained"
              buttonColor="#002d72"
              icon="share-variant"
              style={{ flex: 1 }}
              onPress={sharePlan}
              loading={isLinking}
            >
              Share
            </Button>
            <Button
              mode="contained"
              buttonColor="#A5093E"
              icon="download-outline"
              style={{ flex: 1 }}
              onPress={openExportModal}
            >
              Export
            </Button>
          </View>
        </View>

        {plan.plan.semesters && plan.plan.semesters.map((semester, semIdx) => {
          if (semester.term === 'd') return null;

          return (
            <Card key={semIdx} style={styles.semesterCard}>
              <View style={[styles.tableHeader, { backgroundColor: getTitleColor(semester.level) }]}>
                <Text style={styles.tableHeaderText}>{semester.level} - {semester.term}</Text>
              </View>

              {semester.courses.map((course, cidx) => {
                
                // GROUP COURSES
                if (course.type === 'group') {
                  return (
                    <View key={`group-${cidx}`} style={styles.groupContainer}>
                      {course.courses.map((or_group, orIdx) => (
                        <View key={`or-${orIdx}`} style={{ width: '100%' }}>
                          <View style={styles.groupInnerBox}>
                            {or_group.map((innerCourse, iidx) => {
                              const currentStatus = innerCourse.status || '';
                              return (
                                <View key={`and-${iidx}`} style={{ marginBottom: 10, backgroundColor: getStatusColor(currentStatus), padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' }}>
                                  <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                                    {innerCourse.subject} {innerCourse.number} - {(innerCourse.name || "").replace(/&amp;/g, '&')}
                                  </Text>

                                  <Text style={styles.creditsText}>⭐ Credits: {innerCourse.credits || 0}</Text>
                                  
                                  <TouchableOpacity
                                    style={styles.statusButton}
                                    onPress={() => openStatusPicker(semIdx, cidx, orIdx, iidx, currentStatus)}
                                  >
                                    <Text style={styles.statusButtonLabel}>Status: </Text>
                                    <Text style={styles.statusButtonValue}>{getStatusLabel(currentStatus)}</Text>
                                    <Text style={styles.statusButtonArrow}> ▼</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={styles.noteButton}
                                    onPress={() => openNoteEditor(semIdx, cidx, orIdx, iidx, innerCourse.notes)}
                                  >
                                    <Text style={styles.noteButtonLabel}>📝 </Text>
                                    <Text style={styles.noteButtonText} numberOfLines={1}>
                                      {innerCourse.notes ? innerCourse.notes : 'Add note...'}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                          </View>
                          {orIdx !== course.courses.length - 1 && (
                            <View style={styles.orDivider}>
                              <Divider style={{ flex: 1 }} />
                              <Text style={{ marginHorizontal: 10, fontWeight: 'bold', color: '#666' }}>OR</Text>
                              <Divider style={{ flex: 1 }} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                }

                // STANDARD COURSES & ELECTIVES
                const currentStatus = course.status || '';
                return (
                  <View key={`course-${cidx}`} style={{ borderBottomWidth: 1, borderColor: '#000', backgroundColor: getStatusColor(currentStatus), padding: 10 }}>
                    <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                      {course.subject === 'Elective' ? "Elective" : `${course.subject} ${course.number}`} - {(course.name || "").replace(/&amp;/g, '&')}
                    </Text>

                    <Text style={styles.creditsText}>⭐ Credits: {course.credits || 0}</Text>
                    
                    <TouchableOpacity
                      style={styles.statusButton}
                      onPress={() => openStatusPicker(semIdx, cidx, undefined, undefined, currentStatus)}
                    >
                      <Text style={styles.statusButtonLabel}>Status: </Text>
                      <Text style={styles.statusButtonValue}>{getStatusLabel(currentStatus)}</Text>
                      <Text style={styles.statusButtonArrow}> ▼</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.noteButton}
                      onPress={() => openNoteEditor(semIdx, cidx, undefined, undefined, course.notes)}
                    >
                      <Text style={styles.noteButtonLabel}>📝 </Text>
                      <Text style={styles.noteButtonText} numberOfLines={1}>
                        {course.notes ? course.notes : 'Add note...'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>

      {/* SINGLE SHARED STATUS PICKER MODAL — 1 Picker instead of 40+ */}
      <Modal visible={statusModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Select Status</Text>
            <View style={styles.modalPickerWrapper}>
              <Picker
                selectedValue={tempStatus}
                onValueChange={(val) => setTempStatus(val)}
                style={{ color: '#333' }}
                dropdownIconColor="#333"
              >
                <Picker.Item label="None" value="" />
                <Picker.Item label="Planned" value="planned" />
                <Picker.Item label="In Progress" value="in progress" />
                <Picker.Item label="Completed" value="completed" />
                <Picker.Item label="Failed" value="failed" />
                <Picker.Item label="Substituted" value="substituted" />
                <Picker.Item label="Waived" value="waived" />
                <Picker.Item label="Transferred" value="transferred" />
              </Picker>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 }}>
              <Button textColor="#666" onPress={() => setStatusModalVisible(false)}>Cancel</Button>
              <Button mode="contained" buttonColor="#002d72" onPress={confirmStatus}>Done</Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* NOTE EDITOR MODAL — full text area for long notes */}
      <Modal visible={noteModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Edit Note</Text>
            <TextInput
              mode="outlined"
              placeholder="Write your notes here..."
              value={tempNote}
              onChangeText={setTempNote}
              multiline={true}
              numberOfLines={8}
              style={{ backgroundColor: '#fff', fontSize: 14, minHeight: 180, textAlignVertical: 'top' }}
              outlineColor="#ccc"
              activeOutlineColor="#002d72"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <Button 
                textColor="#A5093E" 
                onPress={() => {
                  setTempNote('');
                }}
              >
                Clear
              </Button>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button textColor="#666" onPress={() => setNoteModalVisible(false)}>Cancel</Button>
                <Button mode="contained" buttonColor="#002d72" onPress={confirmNote}>Save</Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={exportModalVisible} animationType="fade" transparent={true} onRequestClose={() => !exportBusy && setExportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E' }}>Export Plan</Text>
              <IconButton icon="close" size={20} onPress={() => !exportBusy && setExportModalVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 15 }}>
              You can Export "FileName".UDMplan file or PDF file.
            </Text>

            <TextInput
              mode="outlined"
              label="Plan name"
              value={exportName}
              onChangeText={setExportName}
              activeOutlineColor="#002d72"
              style={{ backgroundColor: '#fff', marginBottom: 5 }}
              maxLength={60}
              disabled={exportBusy}
              right={exportName ? <TextInput.Icon icon="close" onPress={() => setExportName('')} /> : null}
            />
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 20, marginLeft: 4 }}>
              Using same name will overwrite the exisiting file.
            </Text>

            <Button
              mode="contained"
              icon="share-outline"
              buttonColor="#002d72"
              style={{ marginBottom: 10 }}
              onPress={handleExportFile}
              loading={exportBusy}
              disabled={exportBusy}
            >
              Share file…
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
              You can share the UDMplan file send via email, Messages, Drive, or other distribution platform.
            </Text>

            {Platform.OS === 'android' && (
              <>
                <Button
                  mode="contained"
                  icon="folder-download-outline"
                  buttonColor="#002d72"
                  style={{ marginBottom: 10 }}
                  onPress={handleExportToFolder}
                  loading={exportBusy}
                  disabled={exportBusy}
                >
                  Save to device folder…
                </Button>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
                  Or you can pick any folder on your device (Downloads, Documents, etc.) and save the UDMplan file there directly.
                </Text>
              </>
            )}

            <Button
              mode="contained"
              icon="content-copy"
              buttonColor="#A5093E"
              style={{ marginBottom: 10 }}
              onPress={handleExportCode}
              loading={exportBusy}
              disabled={exportBusy}
            >
              Copy shareable code
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
              Copies a compact code to your clipboard. Paste it into any chat recipient pastes it into "Import Custom Plan".
            </Text>

            <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
            {/* <Text style={{ color: '#555', fontSize: 11, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }}>
              For printing or non-app users
            </Text> */}

            <Button
              mode="contained"
              icon="file-pdf-box"
              buttonColor="#002d72"
              style={{ marginBottom: 10 }}
              onPress={handleExportPDF}
              loading={exportBusy}
              disabled={exportBusy}
            >
              Share PDF…
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
              Creates a PDF and share it via email, Messages, Drive, or other distribution platform.
            </Text>

            {Platform.OS === 'android' && (
              <>
                <Button
                  mode="contained"
                  icon="folder-download-outline"
                  buttonColor="#002d72"
                  style={{ marginBottom: 10 }}
                  onPress={handleExportPDFToFolder}
                  loading={exportBusy}
                  disabled={exportBusy}
                >
                  Save PDF to device folder…
                </Button>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 5, marginLeft: 4 }}>
                  Or you can pick any folder on your device (Downloads, Documents, etc.) and save the PDF there directly.
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      <FeedbackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  headerBox: { alignItems: 'center', marginBottom: 20 },
  titleText: { fontWeight: 'bold', textAlign: 'center', color: '#333', fontFamily: 'serif' },
  yearText: { fontStyle: 'italic', color: '#666', marginTop: 5, textAlign: 'center' },
  semesterCard: { marginBottom: 20, backgroundColor: '#fff', overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: '#000' },
  tableHeader: { padding: 8, borderBottomWidth: 1, borderColor: '#000', alignItems: 'center' },
  tableHeaderText: { fontWeight: 'bold', fontFamily: 'serif', fontSize: 16, color: '#333' },
  cellText: { fontFamily: 'serif', fontSize: 14, color: '#333', marginBottom: 5 },
  groupContainer: { padding: 10, borderBottomWidth: 1, borderColor: '#000', backgroundColor: '#fafafa' },
  groupInnerBox: { backgroundColor: '#fff', padding: 8, borderWidth: 1, borderColor: '#666' },
  orDivider: { flexDirection: 'row', alignItems: 'center', my: 10, paddingVertical: 8 },
  
  // Credits text
  creditsText: { fontSize: 13, color: '#555', marginTop: 2, marginBottom: 2 },

  // Status button (lightweight replacement for inline Picker)
  statusButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 5, 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderWidth: 1, 
    borderColor: '#666', 
    borderRadius: 4, 
    backgroundColor: '#fff' 
  },
  statusButtonLabel: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  statusButtonValue: { fontSize: 13, color: '#002d72', fontWeight: '600' },
  statusButtonArrow: { fontSize: 11, color: '#666' },

  // Note button (tap to open full editor modal)
  noteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  noteButtonLabel: { fontSize: 13 },
  noteButtonText: { fontSize: 13, color: '#666', flex: 1, fontStyle: 'italic' },

  // Status picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  modalBox: { backgroundColor: '#fff', padding: 20, borderRadius: 8, elevation: 5 },
  modalPickerWrapper: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#f9f9f9' },
});