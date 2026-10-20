// What the landmarks say when they are allowed to gossip, and the secret missions that lead to them.
// The quotes are jokes; every `fact` is true and comes from the sources in public/data/landmarks/landmarks.json.
// The Museum of Forced Labour speaks seriously and is left out of the missions: it remembers victims.

export const GOSSIP = {
  'goethe-house': {
    personality: 'The proud host',
    teaser: 'Fifty years of guests…',
    quote:
      'Goethe lived in me for fifty years and rearranged my rooms the whole time. Now I am closing for renovation, and honestly, I have earned the spa break.',
    fact: 'Goethe lived here from 1782 until his death in 1832. The house closes for about three years of restoration from 2 November 2026.',
  },
  'schiller-house': {
    personality: 'The deadline survivor',
    teaser: 'Shh, he’s writing.',
    quote:
      'Schiller bought me with borrowed money because he wanted peace and quiet to write. Three years of deadlines on my top floor. I can still hear the quill scratching.',
    fact: 'Schiller bought the house in 1802 and died here in 1805. His study on the top floor keeps much of its original furniture.',
  },
  'anna-amalia-library': {
    personality: 'The survivor bookworm',
    teaser: 'No coffee, please.',
    quote:
      'I have survived a fire, centuries of history and thousands of students. Please don’t bring your coffee inside.',
    fact: 'In September 2004 a fire destroyed the roof and much of the Rococo Hall, and about 50,000 books were lost. The hall reopened in 2007.',
  },
  'city-palace': {
    personality: 'The comeback royal',
    teaser: 'I’m back, darlings.',
    quote:
      'I have burned down more often than I like to admit. Burn, rebuild, repeat. This October I reopened, and yes, I am accepting compliments.',
    fact: 'After the fire of 1774 the palace was rebuilt in the Neoclassical style, with Goethe on the building commission. Its east wing reopened on 2–4 October 2026.',
  },
  'bauhaus-museum': {
    personality: 'The minimalist',
    teaser: 'Not. A. Box.',
    quote: 'I am not a box. I am an architectural statement.',
    fact: 'The Bauhaus was founded in Weimar in 1919 by Walter Gropius. This museum, designed by Heike Hanada, opened in April 2019 for the centenary.',
  },
  'museum-neues-weimar': {
    personality: 'The eternal newcomer',
    teaser: 'I’m new. Since 1869.',
    quote:
      'I have been called “new” for over 150 years. Nobody tells me when I am allowed to stop. I have decided: never.',
    fact: 'Built in 1864–69 by the Prague architect Josef Zítek, it was one of the first purpose-built museums in Germany.',
  },
  wittumspalais: {
    personality: 'The salon hostess',
    teaser: 'Darling, sit down.',
    quote:
      'Goethe, Wieland, Herder: they all came to the duchess’s round table in my rooms. I have heard every clever remark in Weimar. Twice.',
    fact: 'Duchess Anna Amalia lived here as a widow from 1774 until her death in 1807. The palace reopened after restoration on 30 April 2026.',
  },
  'liszt-house': {
    personality: 'The piano diva’s flat',
    teaser: 'Practise, practise!',
    quote:
      'Franz Liszt taught young pianists from all over Europe upstairs. His Bechstein is still here. Please don’t play “Chopsticks” on it.',
    fact: 'From 1869 until his death in 1886, Liszt spent several months a year on the upper floor. His Bechstein grand piano is still in the room.',
  },
  'park-cave': {
    personality: 'The underground introvert',
    teaser: 'Down here…',
    quote:
      'The duke had me dug out for a brewery. The brewery never happened. Two hundred years of disappointment, and now you want to look at my rocks?',
    fact: 'The tunnels were dug in 1794–97 for an underground brewery that was never built. Goethe collected fossils from the Weimar travertine.',
  },
  'goethe-schiller-archive': {
    personality: 'The archivist who throws nothing away',
    teaser: 'Filed it.',
    quote:
      'Goethe’s letters? Filed. Schiller’s drafts? Filed. Please stop asking whether I have thought about decluttering.',
    fact: 'Founded in 1885 as the Goethe Archive, it is Germany’s oldest literary archive. Goethe’s papers have been in UNESCO’s Memory of the World register since 2001.',
  },
  'weimar-republic-house': {
    personality: 'The earnest democrat',
    teaser: 'Let’s talk 1919.',
    quote:
      'Germany’s first democracy was born across the square. I tell its story every day, and I never skip the difficult chapters.',
    fact: 'The museum opened on 31 July 2019, exactly 100 years after the National Assembly adopted the constitution of the Weimar Republic.',
  },
  'herder-church': {
    personality: 'The old soul',
    teaser: 'Since 1500, dear.',
    quote:
      'Luther preached here, Bach played my organ, Herder gave sermons for decades. And still people mostly ask me where the toilets are.',
    fact: 'The late-Gothic church was built in 1498–1500. Its altarpiece was begun by Lucas Cranach the Elder and finished by his son in 1555.',
  },
  'theatre-square': {
    personality: 'The inseparable duo',
    teaser: 'It’s getting awkward.',
    quote: 'We have been standing together for ages. It is getting awkward.',
    fact: 'Ernst Rietschel’s bronze of 1857 shows both poets the same height, although Goethe was the shorter one. In 1919 the National Assembly met in the theatre behind them.',
  },
  markt: {
    personality: 'The painter’s retirement home',
    teaser: 'At eighty, I tell you…',
    quote:
      'Lucas Cranach moved in at about eighty and started a giant new altarpiece. Meanwhile you can’t finish a podcast.',
    fact: 'The Cranach House was built in 1547–49 by Nikolaus Gromann. Lucas Cranach the Elder spent the last year of his life here.',
  },
  'city-museum': {
    personality: 'The house that was complimented once',
    teaser: 'Did you hear what Schiller said?',
    quote: 'Schiller called me the most beautiful house in Weimar. I have not stopped mentioning it since.',
    fact: 'The Bertuchhaus was built for the publisher Friedrich Justin Bertuch. The town museum inside began in 1889 and is the oldest town museum in Thuringia.',
  },
  'prehistory-museum': {
    personality: 'The Ice Age storyteller',
    teaser: 'Ice Age, kid.',
    quote:
      'Compared with my collection, everyone else on this map is a teenager. Goethe? A very recent arrival.',
    fact: 'Ice Age finds from the travertines of the Ilm valley around Weimar made the museum known well beyond the region.',
  },
  'forced-labour-museum': {
    personality: 'The witness',
    serious: true,
    teaser: 'Please listen.',
    quote:
      'I stand in a building that was meant to intimidate. Now I tell the stories of the millions who were forced to work. Stay a while and listen.',
    fact: 'The museum opened on 8 May 2024 in the former Gauforum. It is run by the Buchenwald and Mittelbau-Dora Memorials Foundation.',
  },
}

export const MISSIONS = [
  { id: 'theatre-square', clue: 'Somewhere in Weimar, two famous men have been standing together for an unreasonably long time. Find them.' },
  { id: 'theatre-square', clue: 'Find two poets who are exactly the same height. One of them is cheating.' },
  { id: 'anna-amalia-library', clue: 'In 2004, people passed books from hand to hand to rescue them from a fire. Find the building they saved, and leave your coffee outside.' },
  { id: 'bauhaus-museum', clue: 'Locate a grey box that is absolutely not a box. Do not call it a box to its face.' },
  { id: 'goethe-house', clue: 'A poet lived here for fifty years and never stopped rearranging the furniture. His front door opens onto the Frauenplan.' },
  { id: 'schiller-house', clue: 'Somebody borrowed a lot of money to buy a quiet place to write about a man who shot an apple off his son’s head. Find the yellow house on the old Esplanade.' },
  { id: 'city-palace', clue: 'Find the residence that kept burning down and kept coming back. It has a tower and the river park at its feet.' },
  { id: 'wittumspalais', clue: 'A widowed duchess threw the cleverest dinner parties in town. Find her palace, and don’t be late for the round table.' },
  { id: 'liszt-house', clue: 'A pianist with legendary hair spent his summers at the edge of the park. His piano is still waiting for someone brave.' },
  { id: 'park-cave', clue: 'Somewhere under the park lies a beer cellar that never had any beer. Find the way in before it gets too philosophical.' },
  { id: 'goethe-schiller-archive', clue: 'Find the place that has kept everyone’s paperwork since 1885, high above the Ilm. Do not bring a shredder.' },
  { id: 'weimar-republic-house', clue: 'Germany’s first democracy has a house of its own, facing the stage where it was born. Find it.' },
  { id: 'herder-church', clue: 'Luther preached here, Bach played here, a philosopher gave sermons here. Find the church with Cranach’s altar.' },
  { id: 'markt', clue: 'A painter of about eighty moved in here and started an enormous new project. Find his house on the town’s main square.' },
  { id: 'city-museum', clue: 'Schiller once called this the most beautiful house in Weimar. It has been unbearable ever since. Find it.' },
  { id: 'prehistory-museum', clue: 'Find the museum where “old” means Ice Age old. Goethe would count as breaking news there.' },
  { id: 'museum-neues-weimar', clue: 'Find a museum that has been called “new” since 1869. Somebody should break it to it gently.' },
]
