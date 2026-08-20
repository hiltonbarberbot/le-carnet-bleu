/**
 * Static dossier structure shared by Vite and Next.js without bundler-specific
 * raw-loader query suffixes. Interactive state remains owned by the component.
 */
export const interfaceMarkup = String.raw`
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="pullBlur" x="-6%" y="-14%" width="112%" height="128%">
    <feGaussianBlur stdDeviation="0 2.6"/>
  </filter>
  <filter id="spinBlur" x="-8%" y="-20%" width="116%" height="140%">
    <feGaussianBlur stdDeviation="0 3"/>
  </filter>
</svg>

<main class="sheet" id="sheet">
  <span class="punch punch--l"></span><span class="punch punch--r"></span>
  <span class="fold fold--a"></span><span class="fold fold--b"></span>

  <header class="masthead">
    <div class="reg tw ink ink--ribbon">PJ-06<br>CENTRAL ISSUE<br>ONE ROLE EACH</div>
    <div class="plate ink ink--press">
      <div class="classline">CONFIDENTIEL</div>
      <div class="dept">POLICE JUDICIAIRE · NICE<br>DOSSIER D'ENQUÊTE</div>
      <div class="kind" id="kind">DOSSIER ISSUE</div>
    </div>
    <div class="reg reg--r tw ink ink--ribbon">VILLA MIRABELLE<br>Aug 15<br>11:58 P</div>
  </header>

  <p class="dek tw ink ink--ribbon" id="publicPremise">Enter the game code and your name. The central desk will issue exactly one unclaimed dossier to that identity.</p>
  <p class="meta tw ink ink--ribbon" id="publicMeta">CENTRAL REGISTER &nbsp;·&nbsp; ONE PLAYER ID &nbsp;·&nbsp; ONE DOSSIER</p>

  <div class="field">
    <span class="rule rule--a"></span><span class="rule rule--b"></span>

    <div class="slot">
      <div class="window">
        <div class="plate-in" id="plate" role="img"
             aria-label="The seven guests, identities withheld"></div>
      </div>
      <div class="tear"></div>
      <div class="plateline ink ink--press" id="plateline">
        <div class="withheld tw" id="withheld">PARTIES PRESENT<br>NAMES AND PARTICULARS WITHHELD<br>UNTIL A FILE IS ISSUED</div>
        <div class="nm">
          <div class="name" id="myName"></div>
          <div class="role tw" id="myRole"></div>
        </div>
      </div>
      <div class="myline ink ink--fine" id="myline"></div>
      <div class="issued">DOSSIER ISSUED</div>
    </div>

    <div class="left">
      <button class="storytab" type="button" id="storyTab"
              aria-expanded="false" aria-controls="storyfold">
        <span class="lab">THE CASE — WHAT EVERY GUEST AT THIS TABLE KNOWS</span>
        <span class="op" id="storyOp">+ &nbsp;UNFOLD</span>
      </button>

      <div class="storyfold" id="storyfold"><div class="inner">
      <div class="synopsis ink ink--ribbon" id="synopsis">
        <h2>THE STORY — EVERYONE AT THE TABLE KNOWS THIS MUCH</h2>
        <p class="tw" id="synopsisText">The public case briefing will appear when a valid game code is entered. Private facts remain withheld until this named player receives a central assignment.</p>
      </div>
      </div></div>

      <div class="dossier ink ink--fine" id="dossier"></div>
    </div>
  </div>

  <form class="issue" id="issue">
    <label class="issue-field tw" id="gameCodeField"><span>GAME ISSUE CODE</span><input id="gameCode" name="gameCode" autocomplete="off" required></label>
    <label class="issue-field tw"><span>YOUR NAME OR HANDLE</span><input id="participantId" name="participantId" autocomplete="name" maxlength="64" required></label>
    <button type="submit" id="issueBtn">ISSUE MY DOSSIER</button>
    <span class="note tw">Your named ID is stored in the central game register. The next free file is issued once; there is no random local draw.</span>
    <span class="issue-error" id="issueError" role="alert"></span>
  </form>

  <footer class="foot">
    <div class="l ink ink--ribbon">
      <span class="main-only tw">CENTRAL DOSSIER REGISTER<br>NO ROLE MAY BE ISSUED TWICE.</span>
      <span class="file-only">
        <span class="tw">ISSUED TO <span class="strong" id="issuedTo">--</span> &nbsp;--&nbsp; ONE COPY</span><br>
        <button class="rerun tw" type="button" id="rerun">RUN THE REEL AGAIN</button>
      </span>
    </div>
    <div class="r ink ink--ribbon">
      <span class="main-only tw">IDENTITY REQUIRED BEFORE ISSUE</span>
      <span class="file-only tw">THIS SHEET NAMES ONE PARTY ONLY<br>DO NOT SHOW IT AT THE TABLE</span>
    </div>
    <div class="ink ink--press"><span class="foot-secret">SECRET</span></div>
  </footer>

  <div class="hand ink ink--press"><small>P.J. DOSSIER NO</small>62/1147</div>
</main>

<div class="hostbar" id="hostbar">
  <span class="lab" id="hostLab">HOST CONTROLS — NOT FOR PLAYERS</span>
  <button class="hostbtn" type="button" id="startOver">FORGET THIS BROWSER'S ID</button>
</div>
`
