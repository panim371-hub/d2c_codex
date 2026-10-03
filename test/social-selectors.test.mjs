import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramCaptionName } from '../src/social-selectors.mjs';

test('Instagram caption selector accepts current Korean and legacy labels',()=>{
  for (const label of ['캡션 추가...', '캡션 추가…', '문구를 입력하세요...', 'Write a caption...']) {
    assert.match(label,instagramCaptionName);
  }
  assert.doesNotMatch('검색',instagramCaptionName);
});
