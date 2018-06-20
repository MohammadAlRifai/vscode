/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const assert = require('assert');
const cp = require('child_process');
const _7z = require('7zip')['7z'];
const util = require('./lib/util');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const pkg = require('../package.json');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const product = require('../product.json');
const vfs = require('vinyl-fs');

const repoPath = path.dirname(__dirname);
const buildPath = arch => path.join(path.dirname(repoPath), `VSCode-win32-${arch}`);
const zipDir = arch => path.join(repoPath, '.build', `win32-${arch}`, 'archive');
const zipPath = arch => path.join(zipDir(arch), `VSCode-win32-${arch}.zip`);
const setupDir = (arch, target) => path.join(repoPath, '.build', `win32-${arch}`, `${target}-setup`);
const issPath = path.join(__dirname, 'win32', 'code.iss');
const innoSetupPath = path.join(path.dirname(path.dirname(require.resolve('innosetup-compiler'))), 'bin', 'ISCC.exe');

function packageInnoSetup(iss, options, cb) {
	options = options || {};

	const definitions = options.definitions || {};
	const debug = process.argv.some(arg => arg === '--debug-inno');

	if (debug) {
		definitions['Debug'] = 'true';
	}

	const keys = Object.keys(definitions);

	keys.forEach(key => assert(typeof definitions[key] === 'string', `Missing value for '${key}' in Inno Setup package step`));

	const defs = keys.map(key => `/d${key}=${definitions[key]}`);
	const args = [iss].concat(defs);

	cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'ignore', 'inherit'] })
		.on('error', cb)
		.on('exit', () => cb(null));
}

function buildWin32Setup(arch, target) {
	if (target !== 'system' && target !== 'user') {
		throw new Error('Invalid setup target');
	}

	return cb => {
		const ia32AppId = target === 'system' ? product.win32AppId : product.win32UserAppId;
		const x64AppId = target === 'system' ? product.win32x64AppId : product.win32x64UserAppId;

		const definitions = {
			NameLong: product.nameLong,
			NameShort: product.nameShort,
			DirName: product.win32DirName,
			Version: pkg.version,
			RawVersion: pkg.version.replace(/-\w+$/, ''),
			NameVersion: product.win32NameVersion,
			ExeBasename: product.nameShort,
			RegValueName: product.win32RegValueName,
			ShellNameShort: product.win32ShellNameShort,
			AppMutex: product.win32MutexName,
			Arch: arch,
			AppId: arch === 'ia32' ? ia32AppId : x64AppId,
			IncompatibleAppId: arch === 'ia32' ? x64AppId : ia32AppId,
			AppUserId: product.win32AppUserModelId,
			ArchitecturesAllowed: arch === 'ia32' ? '' : 'x64',
			ArchitecturesInstallIn64BitMode: arch === 'ia32' ? '' : 'x64',
			SourceDir: buildPath(arch),
			RepoDir: repoPath,
			OutputDir: setupDir(arch, target),
			InstallTarget: target
		};

		packageInnoSetup(issPath, { definitions }, cb);
	};
}

function defineWin32SetupTasks(arch, target) {
	gulp.task(`clean-vscode-win32-${arch}-${target}-setup`, util.rimraf(setupDir(arch, target)));
	gulp.task(`vscode-win32-${arch}-${target}-setup`, [`clean-vscode-win32-${arch}-${target}-setup`], buildWin32Setup(arch, target));
}

defineWin32SetupTasks('ia32', 'system');
defineWin32SetupTasks('x64', 'system');
defineWin32SetupTasks('ia32', 'user');
defineWin32SetupTasks('x64', 'user');

function archiveWin32Setup(arch) {
	return cb => {
		const args = ['a', '-tzip', zipPath(arch), '.', '-r'];

		cp.spawn(_7z, args, { stdio: 'inherit', cwd: buildPath(arch) })
			.on('error', cb)
			.on('exit', () => cb(null));
	};
}

gulp.task('clean-vscode-win32-ia32-archive', util.rimraf(zipDir('ia32')));
gulp.task('vscode-win32-ia32-archive', ['clean-vscode-win32-ia32-archive'], archiveWin32Setup('ia32'));

gulp.task('clean-vscode-win32-x64-archive', util.rimraf(zipDir('x64')));
gulp.task('vscode-win32-x64-archive', ['clean-vscode-win32-x64-archive'], archiveWin32Setup('x64'));

function copyInnoUpdater(arch) {
	return () => {
		return gulp.src('build/win32/{inno_updater.exe,vcruntime140.dll}', { base: 'build/win32' })
			.pipe(vfs.dest(path.join(buildPath(arch), 'tools')));
	};
}

gulp.task('vscode-win32-ia32-copy-inno-updater', copyInnoUpdater('ia32'));
gulp.task('vscode-win32-x64-copy-inno-updater', copyInnoUpdater('x64'));